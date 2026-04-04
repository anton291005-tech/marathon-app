/**
 * Wochen-Fazit und Kennzahlen für eine Plan-Woche (datenbasiert).
 */

import { parseSessionDateLabel } from "./appSmartFeatures";
import type { PlanWeek, SessionLog, PlanSession } from "./marathonPrediction";
import { getPlannedKmEquiv } from "./marathonPrediction";

function weekSessionLoggedKm(session: PlanSession, log: SessionLog | undefined): number {
  if (!log?.done) return 0;
  const parsed = Number.parseFloat(String(log.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return session.km > 0 ? session.km : getPlannedKmEquiv(session);
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
  actualKm: number;
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

/**
 * Kennzahlen + Fazit. `now` für „Woche steht bevor“ / vergangene Woche.
 */
export function analyzeWeek(week: PlanWeek, logs: Record<string, SessionLog>, now: Date = new Date()): WeeklyAnalysis {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { first, last } = weekDateBounds(week);
  const isFutureWeek = !!(first && first.getTime() > todayStart.getTime());

  const trainable = week.s.filter((s) => s.type !== "rest");
  const plannedTrainSessions = trainable.length;

  let plannedKm = week.km;
  let actualKm = 0;
  let doneSessions = 0;
  let intensePlanned = 0;
  let intenseDone = 0;

  const longSessions = trainable.filter((s) => s.type === "long" && s.km > 0);
  const longRunPlanned = longSessions.length > 0;
  const longRunKmPlanned = longSessions.reduce((m, s) => Math.max(m, s.km || 0), 0);
  let longRunDone = false;
  if (longSessions.length > 0) {
    longRunDone = longSessions.some((s) => logs[s.id]?.done === true);
  }

  for (const s of trainable) {
    const log = logs[s.id];
    if (["interval", "tempo", "race"].includes(s.type)) {
      intensePlanned += 1;
      if (log?.done) intenseDone += 1;
    }
    if (log?.done) {
      doneSessions += 1;
      actualKm += weekSessionLoggedKm(s, log);
    }
  }

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

  return {
    plannedKm,
    actualKm,
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
