/**
 * Plan-Adherence Score (0–100): Umsetzung über die gesamte Vorbereitung (alle fälligen
 * Nicht-Ruhe-Einheiten seit Planbeginn bis „heute“, Europe/Berlin).
 * Reine Business-Logik — keine React-/UI-Abhängigkeiten.
 */

import {
  berlinWallClockYmd,
  isSessionLogDone,
  parseSessionDateLabel,
} from "../appSmartFeatures";
import { getAppNow } from "../core/time/timeSystem";
import { getPlannedKmEquiv } from "../marathonPrediction";
import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import type { StoredHealthRun } from "../healthRuns";
import { getStoredHealthRunCanonicalType, storedHealthRunDistanceKmNumeric } from "../healthRuns";
import { sanitizeDistance } from "../sanitizeDistance";

const RUN_SESSION_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

export type PlanAdherenceBand = "green" | "yellow" | "red";

export type TrainingSession = {
  planned: boolean;
  completed: boolean;
  plannedDistance?: number;
  actualDistance?: number;
  plannedIntensity?: string;
  actualIntensity?: string;
  date: string;
};

export type PlanAdherenceScoreResult = {
  /** 0 = keine fälligen Einheiten oder keine Umsetzung; sonst 1–100 */
  score: number;
  band: PlanAdherenceBand;
  /** 0–100: steigt mit der Anzahl ausgewerteter Einheiten (frühe Phase = niedriger) */
  confidence: number;
  /** Fällige Nicht-Ruhe-Einheiten bis heute (Berlin). */
  dueCompleted: number;
  dueTotal: number;
};

function sessionDateToYmd(s: PlanSession, year = 2026): string | null {
  const d = parseSessionDateLabel(s.date, year);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const adhereRolling = { value: 8 };

function plannedKmForSession(s: PlanSession): number {
  return sanitizeDistance(getPlannedKmEquiv(s), { rollingRef: adhereRolling, weeklyAvgKm: 40 });
}

function parseManualKm(log: SessionLog | undefined): number {
  const parsed = parseFloat(String(log?.actualKm || "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function wrongSportRunOnNonRunSlot(log: SessionLog | undefined, byId: Map<string, StoredHealthRun>): boolean {
  const id = log?.assignedRun?.runId;
  if (!id) return false;
  const h = byId.get(id);
  return !!(h && getStoredHealthRunCanonicalType(h) === "run");
}

function extractActualKm(
  s: PlanSession,
  log: SessionLog | undefined,
  byId: Map<string, StoredHealthRun>,
): number | undefined {
  if (!isSessionLogDone(log)) return undefined;
  if (s.type === "bike" || s.type === "strength") {
    const m = parseManualKm(log);
    return m > 0 ? sanitizeDistance(m, { rollingRef: adhereRolling, weeklyAvgKm: 40 }) : undefined;
  }
  if (!RUN_SESSION_TYPES.has(s.type)) return undefined;
  const ar = log?.assignedRun;
  if (ar?.runId) {
    const h = byId.get(ar.runId);
    if (!h || getStoredHealthRunCanonicalType(h) !== "run") {
      const m = parseManualKm(log);
      return m > 0 ? sanitizeDistance(m, { rollingRef: adhereRolling, weeklyAvgKm: 40 }) : undefined;
    }
    const actualKm =
      typeof ar.distanceKm === "number" && ar.distanceKm > 0
        ? ar.distanceKm
        : storedHealthRunDistanceKmNumeric(h) ?? 0;
    return actualKm > 0 ? sanitizeDistance(actualKm, { rollingRef: adhereRolling, weeklyAvgKm: 40 }) : undefined;
  }
  const m = parseManualKm(log);
  return m > 0 ? sanitizeDistance(m, { rollingRef: adhereRolling, weeklyAvgKm: 40 }) : undefined;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bandFromScore(score: number): PlanAdherenceBand {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

/**
 * Kernaggregation: reine, regelbasierte Funktion auf der Historie.
 * `plannedSessions` = alle Einträge mit `planned === true` (typisch: gesamte Filterliste).
 */
export function computePlanAdherenceScoreFromHistory(history: TrainingSession[]): {
  score: number;
  confidence: number;
} {
  const plannedSessions = history.filter((s) => s.planned);
  if (plannedSessions.length === 0) {
    return { score: 0, confidence: 0 };
  }

  const n = plannedSessions.length;
  const completionRate = plannedSessions.filter((s) => s.completed).length / n;

  const volumeAdherence = average(
    plannedSessions.map((s) => {
      if (!s.completed) return 0;
      const pd = s.plannedDistance;
      const ad = s.actualDistance;
      if (!pd || !ad) return 0.5;
      return Math.min(ad / pd, 1);
    }),
  );

  const intensityAdherence = average(
    plannedSessions.map((s) => {
      if (!s.completed) return 0;
      return s.plannedIntensity === s.actualIntensity ? 1 : 0.5;
    }),
  );

  const raw = completionRate * 0.5 + volumeAdherence * 0.3 + intensityAdherence * 0.2;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));

  const confidence = Math.round(100 * Math.min(1, n / 24));

  return { score, confidence };
}

function buildTrainingHistoryFromPlan(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  healthRuns: StoredHealthRun[];
  now: Date;
}): TrainingSession[] {
  const todayYmd = berlinWallClockYmd(args.now);
  const byId = new Map<string, StoredHealthRun>();
  for (const r of args.healthRuns) {
    if (r?.runId) byId.set(r.runId, r);
  }

  const out: TrainingSession[] = [];
  for (const week of args.plan) {
    for (const s of week.s ?? []) {
      if (s.type === "rest") continue;
      const ymd = sessionDateToYmd(s);
      if (!ymd || ymd > todayYmd) continue;

      const log = args.logs[s.id];
      const completed = isSessionLogDone(log);
      const plannedDist = plannedKmForSession(s);
      const actualDistance = extractActualKm(s, log, byId);
      const plannedIntensity = s.type;
      let actualIntensity = s.type;
      if (completed && (s.type === "bike" || s.type === "strength") && wrongSportRunOnNonRunSlot(log, byId)) {
        actualIntensity = "running";
      }

      out.push({
        planned: true,
        completed,
        plannedDistance: plannedDist > 0 ? plannedDist : undefined,
        actualDistance,
        plannedIntensity,
        actualIntensity,
        date: ymd,
      });
    }
  }
  return out;
}

/**
 * Volle Vorbereitung: alle nicht-Ruhe-Sessions mit Kalenderdatum ≤ heute (Berlin),
 * unabhängig von einem 7-Tage-Fenster oder „heutiger“ Einheit.
 */
export function computePlanAdherenceScore(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  healthRuns: StoredHealthRun[];
  now?: Date;
}): PlanAdherenceScoreResult {
  const now = args.now ?? getAppNow();
  const history = buildTrainingHistoryFromPlan({
    plan: args.plan,
    logs: args.logs,
    healthRuns: args.healthRuns,
    now,
  });
  const { score, confidence } = computePlanAdherenceScoreFromHistory(history);
  const dueTotal = history.length;
  const dueCompleted = history.filter((s) => s.completed).length;
  return {
    score,
    band: bandFromScore(score),
    confidence,
    dueCompleted,
    dueTotal,
  };
}

/** Gesamtvorbereitung: alle Nicht-Ruhe-Einheiten im Plan (inkl. zukünftige Wochen). */
export function computePlanDueSessionCounts(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  healthRuns?: StoredHealthRun[];
  now?: Date;
}): { completed: number; total: number } {
  void args.healthRuns;
  void args.now;
  let total = 0;
  let completed = 0;
  for (const week of args.plan) {
    for (const s of week.s ?? []) {
      if (s.type === "rest") continue;
      total += 1;
      if (isSessionLogDone(args.logs[s.id])) completed += 1;
    }
  }
  return { completed, total };
}

export function planAdherenceTextColor(band: PlanAdherenceBand): string {
  if (band === "green") return "#4ade80";
  if (band === "yellow") return "#fbbf24";
  return "#f87171";
}
