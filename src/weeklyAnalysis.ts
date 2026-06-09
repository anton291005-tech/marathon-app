/**
 * Wochen-Fazit und Kennzahlen für eine Plan-Woche (datenbasiert).
 */

import { isSessionLogDone, parseSessionDateLabel } from "./appSmartFeatures";
import { getStoredHealthRunCanonicalType, type StoredHealthRun } from "./healthRuns";
import type { PlanWeek, SessionLog, PlanSession } from "./marathonPrediction";
import { getAppNow } from "./core/time/timeSystem";
import { getPlannedKmEquiv, getEffectiveKm } from "./marathonPrediction";
import { recordWeekKmMismatch } from "./distanceIntegrity";
import {
  formatKm,
  getSessionPlannedDistanceKm,
  USE_COMPUTED_WEEK_KM,
} from "./sessionDistance";

function countsTowardWeeklyRunKm(s: PlanSession): boolean {
  return s.type !== "strength" && s.type !== "bike";
}

function weeklyKmSource(
  log: SessionLog | undefined,
): "appleHealth" | "actualKmField" | "plannedFallback" {
  const ar = log?.assignedRun;
  if (ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0) {
    return "appleHealth";
  }
  const parsed = Number.parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return "actualKmField";
  return "plannedFallback";
}

function weekDateBounds(week: PlanWeek): { first: Date | null; last: Date | null } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (const s of week.s) {
    const d = parseSessionDateLabel(s.date);
    if (!d) continue;
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return { first, last };
}

export type WeeklyVerdictTone = "strong" | "solid" | "warn" | "neutral" | "upcoming";

export type WeeklyAnalysis = {
  plannedKm: number;
  /** Running km only (excludes bike sessions). */
  actualKm: number;
  actualBikeSessionKm: number;
  actualTotalTrainingKm: number;
  doneSessions: number;
  plannedTrainSessions: number;
  longRunPlanned: boolean;
  longRunDone: boolean;
  longRunKmPlanned: number;
  intensePlanned: number;
  intenseDone: number;
  verdict: string;
  verdictTone: WeeklyVerdictTone;
  /** Woche liegt komplett in der Zukunft */
  isFutureWeek: boolean;
};

/** Actual running km for a completed session; rejects non-run Health assignments when `healthById` is set. */
export function getSessionRunningActualKm(
  session: PlanSession,
  log: SessionLog | undefined,
  healthById?: Map<string, StoredHealthRun>,
): number {
  if (session.type === "bike" || session.type === "strength" || session.type === "rest") return 0;
  if (!isSessionLogDone(log)) return 0;
  const ar = log?.assignedRun;
  if (ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0) {
    if (healthById && ar.runId) {
      const hr = healthById.get(ar.runId);
      if (hr && getStoredHealthRunCanonicalType(hr) !== "run") return 0;
    }
    return ar.distanceKm;
  }
  const parsed = Number.parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return getSessionPlannedDistanceKm(session);
}

function getBikeSessionActualKm(
  session: PlanSession,
  log: SessionLog | undefined,
  healthById?: Map<string, StoredHealthRun>,
): number {
  if (session.type !== "bike") return 0;
  if (!isSessionLogDone(log)) return 0;
  const ar = log?.assignedRun;
  if (ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0) {
    if (healthById && ar.runId) {
      const hr = healthById.get(ar.runId);
      if (hr && getStoredHealthRunCanonicalType(hr) !== "bike") return 0;
    }
    return ar.distanceKm;
  }
  const parsed = Number.parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return getPlannedKmEquiv(session);
}

export function getPlanWeekTimeBoundsMs(week: PlanWeek): { startMs: number; endMs: number } | null {
  const { first, last } = weekDateBounds(week);
  if (!first || !last) return null;
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0, 0);
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** Prefer Apple Health run sum when > 0; else fall back to session-log running km. */
export function resolveWeekDisplayRunKm(healthRunKm: number, sessionLogsRunKm: number): number {
  if (typeof healthRunKm === "number" && Number.isFinite(healthRunKm) && healthRunKm > 0) return healthRunKm;
  return sessionLogsRunKm;
}

/**
 * Kennzahlen + Fazit. `now` für „Woche steht bevor“ / vergangene Woche.
 */
export function analyzeWeek(
  week: PlanWeek,
  logs: Record<string, SessionLog>,
  now: Date = getAppNow(),
  healthById?: Map<string, StoredHealthRun>,
): WeeklyAnalysis {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { first, last } = weekDateBounds(week);
  const isFutureWeek = !!(first && first.getTime() > todayStart.getTime());

  const trainable = week.s.filter((s) => s.type !== "rest");
  const plannedTrainSessions = trainable.length;

  const plannedKm = week.km;
  let actualKm = 0;
  let actualBikeSessionKm = 0;
  let doneSessions = 0;
  let intensePlanned = 0;
  let intenseDone = 0;

  const weeklyKmIncludedRuns: Array<{
    date: string;
    source: "appleHealth" | "actualKmField" | "plannedFallback";
    plannedKm: number;
    actualKmUsed: number;
  }> = [];

  const longSessions = trainable.filter((s) => s.type === "long" && s.km > 0);
  const longRunPlanned = longSessions.length > 0;
  const longRunKmPlanned = longSessions.reduce((m, s) => Math.max(m, s.km || 0), 0);
  let longRunDone = false;
  if (longSessions.length > 0) {
    longRunDone = longSessions.some((s) => isSessionLogDone(logs[s.id]));
  }

  for (const s of trainable) {
    const log = logs[s.id];
    if (["interval", "tempo", "race"].includes(s.type)) {
      intensePlanned += 1;
      if (isSessionLogDone(log)) intenseDone += 1;
    }
    if (isSessionLogDone(log)) {
      doneSessions += 1;
      if (s.type === "bike") {
        actualBikeSessionKm += getBikeSessionActualKm(s, log, healthById);
      } else if (countsTowardWeeklyRunKm(s)) {
        const usedKm = healthById ? getSessionRunningActualKm(s, log, healthById) : getEffectiveKm(s, log);
        actualKm += usedKm;
        weeklyKmIncludedRuns.push({
          date: s.date,
          source: weeklyKmSource(log),
          plannedKm: s.km > 0 ? s.km : getPlannedKmEquiv(s),
          actualKmUsed: usedKm,
        });
      }
    }
  }

  console.log("weeklyPlannedKm", plannedKm);
  console.log("weeklyCompletedActualKm", actualKm);
  console.log("weeklyKmIncludedRuns", weeklyKmIncludedRuns);

  let verdict = "Solide Woche";
  let verdictTone: WeeklyVerdictTone = "solid";

  if (isFutureWeek) {
    verdict = "Woche steht bevor";
    verdictTone = "upcoming";
  } else if (longRunPlanned && !longRunDone) {
    verdict = "Long Run fehlt";
    verdictTone = "warn";
  } else if (plannedKm > 0 && actualKm < plannedKm * 0.72 && doneSessions >= 2) {
    verdict = "Zu wenig Umfang";
    verdictTone = "warn";
  } else if (
    plannedKm > 0 &&
    actualKm >= plannedKm * 0.92 &&
    doneSessions >= plannedTrainSessions - 1 &&
    plannedTrainSessions >= 4
  ) {
    verdict = "Starke Trainingswoche";
    verdictTone = "strong";
  } else if (last && last.getTime() < todayStart.getTime() && doneSessions === 0) {
    verdict = "Woche ohne erledigte Einheiten";
    verdictTone = "warn";
  }

  const actualTotalTrainingKm = actualKm + actualBikeSessionKm;

  return {
    plannedKm,
    actualKm,
    actualBikeSessionKm,
    actualTotalTrainingKm,
    doneSessions,
    plannedTrainSessions,
    longRunPlanned,
    longRunDone,
    longRunKmPlanned,
    intensePlanned,
    intenseDone,
    verdict,
    verdictTone,
    isFutureWeek,
  };
}

function countsTowardWeeklyRunningKm(s: PlanSession): boolean {
  return s.type !== "rest" && s.type !== "strength" && s.type !== "bike";
}

/** Sum of planned running km (structured/desc-aware), rounded — recovery load SSOT. */
export function weekPlannedRunningKm(week: PlanWeek): number {
  const sum = week.s
    .filter(countsTowardWeeklyRunningKm)
    .reduce((acc, s) => acc + getSessionPlannedDistanceKm(s), 0);
  return formatKm(sum);
}

export function getWeekRunningDistanceKm(week: PlanWeek): number {
  return weekPlannedRunningKm(week);
}

/** Trainingsvolumen: Lauf + Rad, ohne Kraft. */
export function getWeekPlannedLoadKm(week: PlanWeek): number {
  const sum = week.s
    .filter((s) => s.type !== "rest" && s.type !== "strength")
    .reduce((acc, s) => {
      if (s.type === "bike") return acc + getPlannedKmEquiv(s);
      if (countsTowardWeeklyRunningKm(s)) return acc + getSessionPlannedDistanceKm(s);
      return acc;
    }, 0);
  return formatKm(sum);
}

export function getWeekPlannedKmForDisplay(week: PlanWeek): number {
  if (!USE_COMPUTED_WEEK_KM) return formatKm(week.km);
  return weekPlannedRunningKm(week);
}

export function validateWeekDistances(week: PlanWeek): void {
  const sumSessions = weekPlannedRunningKm(week);
  const diff = Math.abs(sumSessions - week.km);
  if (diff > 2) {
    recordWeekKmMismatch(week.wn, sumSessions, week.km, diff);
  }
}
