/**
 * Recap-Stats einer abgeschlossenen Vorbereitung — EINMAL berechnet und als Snapshot gespeichert
 * (`prep_recaps.stats`). Der Rückblick liest danach nur noch den Snapshot.
 *
 * Regel für fehlende Daten: Jeder Block ist nullable. Ein Block ohne belastbare Daten ist null
 * (nie 0/„N/A") — die Story lässt die zugehörige Slide dann weg.
 *
 * Bewusst NICHT enthalten: eine „Prognose vor dem Rennen". Sie wurde nie gespeichert, und ein
 * rückwirkend berechneter Wert wiche von dem ab, was die App damals zeigte (Backlog: Race-Week-
 * Prognose künftig persistieren).
 *
 * Wiederverwendet: `getSessionRunningActualKm` (Ist-km; Rad/Kraft zählen nicht), `getSessionPlannedDistanceKm`,
 * `computeTrainableWholePlanCounts` (gleiche Zählung wie der Home-Ring), `normalizeTrainingPhase`,
 * `calculateLongestPlanAwareStreak` (gleiche Tages-Semantik wie die Home-Kachel „Serie").
 */

import { isSessionLogDone } from "../appSmartFeatures";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import type { StoredHealthRun } from "../healthRuns";
import { computeTrainableWholePlanCounts } from "../lib/training/progressCalculation";
import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { normalizeTrainingPhase, type TrainingPhase } from "../planV2/trainingPhase";
import type { RecoveryDailyRow } from "../recovery/recoveryTypes";
import { getSessionPlannedDistanceKm } from "../sessionDistance";
import { calculateLongestPlanAwareStreak, type PlanDayStreakStatus } from "../trainingIntelligence/streak";
import { getSessionRunningActualKm } from "../weeklyAnalysis";
import type { PrepCompletedBy } from "./prepCompletionState";

/** Erhöhen, wenn sich Form oder Rechenregeln der Stats ändern — ältere Snapshots werden neu gebaut. */
export const PREP_RECAP_SCHEMA_VERSION = 1;

const MARATHON_KM = 42.195;
const BODY_WINDOW_DAYS = 28;
const BODY_MIN_VALID_DAYS = 7;
const QUALITY_TYPES = new Set(["interval", "tempo"]);
const NON_RUNNING_TYPES = new Set(["rest", "bike", "strength"]);

export type PrepRecapStats = {
  schemaVersion: number;
  race: {
    name: string | null;
    ymd: string;
    distanceKm: number | null;
    goalSeconds: number | null;
    completedBy: PrepCompletedBy;
  };
  /** Anzahl Planwochen bis einschließlich Renntag. */
  weeks: { count: number; firstYmd: string } | null;
  volume: {
    actualKm: number;
    /** null, wenn der Plan keine km-Angaben liefert (nie 0). */
    plannedKm: number | null;
    /** Ist/Plan, null ohne Plan-km. */
    ratio: number | null;
    /** Ist-km / 42,195 — nur ab 1 (sonst null, keine „0,4 Marathons"). */
    marathonEquivalents: number | null;
  } | null;
  /** null ohne erledigte Einheit (auch longRuns/quality) — die Story zeigt nie „0 von X". */
  sessions: { done: number; planned: number; skipped: number } | null;
  /** Längste Serie in Trainingstagen (Semantik der Home-Kachel „Serie"). */
  streak: { longestDays: number } | null;
  longRuns: { done: number; total: number; longestKm: number | null } | null;
  /** interval/tempo + Vorbereitungsrennen; das Zielrennen selbst zählt nicht. */
  quality: { done: number; total: number } | null;
  strongestWeek: { weekNumber: number; km: number } | null;
  /**
   * Phasen in Planreihenfolge (aufeinanderfolgende Wochen gleicher Phase zusammengefasst).
   * `km` null, wenn in der Phase nichts geloggt wurde — die Phase bleibt in der Reise, ohne „0 km".
   */
  phases: Array<{ phase: TrainingPhase; km: number | null; weeks: number }> | null;
  body: {
    sleep: { firstAvgHours: number; lastAvgHours: number } | null;
    hrv: { firstAvgMs: number; lastAvgMs: number } | null;
  } | null;
};

export type BuildPrepRecapInput = {
  plan: readonly PlanWeek[];
  logs: Readonly<Record<string, SessionLog>>;
  healthRuns: readonly StoredHealthRun[];
  recoveryDailyRows: readonly RecoveryDailyRow[];
  raceSession: PlanSession | null;
  raceYmd: string;
  raceName: string | null;
  raceDistanceKm: number | null;
  goalSeconds: number | null;
  completedBy: PrepCompletedBy;
};

type DatedSession = { session: PlanSession; ymd: string; weekIndex: number };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Gerundet > 0, sonst null — erst nach dem Runden prüfen, damit nie ein „0,0 km" entsteht. */
function positiveKm(n: number): number | null {
  const r = round1(n);
  return r > 0 ? r : null;
}

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function localDateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = ymdToLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return localDateToYmd(d);
}

function isRunning(session: PlanSession): boolean {
  return !NON_RUNNING_TYPES.has(session.type);
}

/** Alle Sessions bis einschließlich Renntag, mit Kalendertag und Wochenindex. */
function collectBlockSessions(plan: readonly PlanWeek[], raceYmd: string): DatedSession[] {
  const out: DatedSession[] = [];
  plan.forEach((week, weekIndex) => {
    if (!week || typeof week !== "object") return;
    for (const session of week.s ?? []) {
      if (!session) continue;
      const ymd = sessionDayIso(session);
      if (!ymd || ymd > raceYmd) continue;
      out.push({ session, ymd, weekIndex });
    }
  });
  return out;
}

function buildStreak(block: DatedSession[], firstYmd: string, raceYmd: string, logs: BuildPrepRecapInput["logs"]) {
  const trainingByDay = new Map<string, PlanSession[]>();
  for (const { session, ymd } of block) {
    if (session.type === "rest") continue;
    const list = trainingByDay.get(ymd) ?? [];
    list.push(session);
    trainingByDay.set(ymd, list);
  }
  const statuses: PlanDayStreakStatus[] = [];
  for (let ymd = firstYmd; ymd <= raceYmd; ymd = addDaysYmd(ymd, 1)) {
    const sessions = trainingByDay.get(ymd);
    if (!sessions || sessions.length === 0) statuses.push("no_training_planned");
    else if (sessions.some((s) => isSessionLogDone(logs[s.id]))) statuses.push("completed");
    else statuses.push("incomplete_planned");
  }
  const longestDays = calculateLongestPlanAwareStreak(statuses);
  return longestDays > 0 ? { longestDays } : null;
}

function average(values: number[]): number | null {
  if (values.length < BODY_MIN_VALID_DAYS) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bodyWindowValues(
  rows: readonly RecoveryDailyRow[],
  fromYmd: string,
  toYmd: string,
  pick: (row: RecoveryDailyRow) => number | undefined,
  outlier: (row: RecoveryDailyRow) => boolean,
): number[] {
  const out: number[] = [];
  for (const row of rows) {
    if (!row || typeof row.date !== "string" || row.date < fromYmd || row.date > toYmd) continue;
    if (outlier(row)) continue;
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/**
 * Schlaf/HRV: Mittel der ersten 4 Blockwochen vs. der letzten 4 Wochen bis zum Vortag des Rennens.
 * Nur mit ≥ 7 validen Tagen je Fenster (QC-Ausreißer ausgeschlossen) und ohne Überlappung der Fenster.
 */
function buildBody(rows: readonly RecoveryDailyRow[], firstYmd: string, raceYmd: string): PrepRecapStats["body"] {
  const firstTo = addDaysYmd(firstYmd, BODY_WINDOW_DAYS - 1);
  const lastTo = addDaysYmd(raceYmd, -1);
  const lastFrom = addDaysYmd(lastTo, -(BODY_WINDOW_DAYS - 1));
  if (lastFrom <= firstTo) return null;

  const sleepPick = (r: RecoveryDailyRow) => r.sleepHours;
  const sleepOutlier = (r: RecoveryDailyRow) => r.signalMeta?.sleep?.outlierFlag === true;
  const hrvPick = (r: RecoveryDailyRow) => r.hrvMs;
  const hrvOutlier = (r: RecoveryDailyRow) => r.signalMeta?.hrvMs?.outlierFlag === true;

  const sleepFirst = average(bodyWindowValues(rows, firstYmd, firstTo, sleepPick, sleepOutlier));
  const sleepLast = average(bodyWindowValues(rows, lastFrom, lastTo, sleepPick, sleepOutlier));
  const hrvFirst = average(bodyWindowValues(rows, firstYmd, firstTo, hrvPick, hrvOutlier));
  const hrvLast = average(bodyWindowValues(rows, lastFrom, lastTo, hrvPick, hrvOutlier));

  const sleep =
    sleepFirst != null && sleepLast != null
      ? { firstAvgHours: round1(sleepFirst), lastAvgHours: round1(sleepLast) }
      : null;
  const hrv =
    hrvFirst != null && hrvLast != null ? { firstAvgMs: Math.round(hrvFirst), lastAvgMs: Math.round(hrvLast) } : null;
  return sleep || hrv ? { sleep, hrv } : null;
}

export function buildPrepRecapSnapshot(input: BuildPrepRecapInput): PrepRecapStats {
  const { plan, logs, raceSession, raceYmd } = input;
  const healthById = new Map<string, StoredHealthRun>();
  for (const run of input.healthRuns ?? []) {
    if (run?.runId) healthById.set(run.runId, run);
  }

  const block = collectBlockSessions(plan ?? [], raceYmd);
  const race: PrepRecapStats["race"] = {
    name: input.raceName,
    ymd: raceYmd,
    distanceKm: input.raceDistanceKm,
    goalSeconds: input.goalSeconds,
    completedBy: input.completedBy,
  };

  if (block.length === 0) {
    return {
      schemaVersion: PREP_RECAP_SCHEMA_VERSION,
      race,
      weeks: null,
      volume: null,
      sessions: null,
      streak: null,
      longRuns: null,
      quality: null,
      strongestWeek: null,
      phases: null,
      body: null,
    };
  }

  const firstYmd = block.reduce((min, e) => (e.ymd < min ? e.ymd : min), block[0].ymd);
  const isGoalRace = (s: PlanSession) => raceSession != null && s.id === raceSession.id;
  const actualKmOf = (s: PlanSession) => getSessionRunningActualKm(s, logs[s.id], healthById);

  // Wochen: nur Wochen, die bis zum Renntag Sessions haben.
  const weekIndices = Array.from(new Set(block.map((e) => e.weekIndex))).sort((a, b) => a - b);
  const weeks = { count: weekIndices.length, firstYmd };

  // Volumen (nur Laufen).
  let actualKm = 0;
  let plannedKm = 0;
  const kmByWeek = new Map<number, number>();
  for (const { session, weekIndex } of block) {
    if (!isRunning(session)) continue;
    plannedKm += getSessionPlannedDistanceKm(session);
    const km = actualKmOf(session);
    actualKm += km;
    kmByWeek.set(weekIndex, (kmByWeek.get(weekIndex) ?? 0) + km);
  }
  const actualKmRounded = positiveKm(actualKm);
  const volume =
    actualKmRounded != null
      ? {
          actualKm: actualKmRounded,
          plannedKm: positiveKm(plannedKm),
          ratio: plannedKm > 0 ? Math.round((actualKm / plannedKm) * 1000) / 1000 : null,
          marathonEquivalents: actualKm / MARATHON_KM >= 1 ? round1(actualKm / MARATHON_KM) : null,
        }
      : null;

  // Einheiten (gleiche Zählung wie der Home-Ring: Ruhetage raus, Übersprungene im Nenner).
  const trainable = block.map((e) => e.session).filter((s) => s.type !== "rest");
  const counts = computeTrainableWholePlanCounts(trainable, logs as Record<string, SessionLog | undefined>);
  const skipped = trainable.filter((s) => logs[s.id]?.skipped === true && !isSessionLogDone(logs[s.id])).length;
  const sessions = counts.total > 0 && counts.completed > 0 ? { done: counts.completed, planned: counts.total, skipped } : null;

  // Long Runs + längster Trainingslauf (ohne Zielrennen).
  const longs = trainable.filter((s) => s.type === "long");
  const longDone = longs.filter((s) => isSessionLogDone(logs[s.id])).length;
  let longestKm = 0;
  for (const s of trainable) {
    if (!isRunning(s) || isGoalRace(s)) continue;
    longestKm = Math.max(longestKm, actualKmOf(s));
  }
  const longRuns =
    longs.length > 0 && longDone > 0
      ? { done: longDone, total: longs.length, longestKm: longestKm > 0 ? round1(longestKm) : null }
      : null;

  // Qualität: interval/tempo + Vorbereitungsrennen, ohne Zielrennen.
  const quality = trainable.filter((s) => QUALITY_TYPES.has(s.type) || (s.type === "race" && !isGoalRace(s)));
  const qualityDone = quality.filter((s) => isSessionLogDone(logs[s.id])).length;
  const qualityBlock = quality.length > 0 && qualityDone > 0 ? { done: qualityDone, total: quality.length } : null;

  // Stärkste Woche (meiste Ist-Lauf-km).
  let strongestWeek: PrepRecapStats["strongestWeek"] = null;
  for (const weekIndex of weekIndices) {
    const km = kmByWeek.get(weekIndex) ?? 0;
    if (km <= 0) continue;
    if (strongestWeek == null || km > strongestWeek.km) {
      const wn = plan[weekIndex]?.wn;
      strongestWeek = { weekNumber: typeof wn === "number" ? wn : weekIndex + 1, km: round1(km) };
    }
  }

  // Phasen-Reise (nur wenn mindestens zwei Phasen und überhaupt km).
  const phaseGroups: Array<{ phase: TrainingPhase; km: number; weeks: number }> = [];
  for (const weekIndex of weekIndices) {
    const raw = plan[weekIndex]?.phase;
    if (typeof raw !== "string" || !raw.trim()) {
      phaseGroups.length = 0;
      break;
    }
    const phase = normalizeTrainingPhase(raw);
    const km = kmByWeek.get(weekIndex) ?? 0;
    const last = phaseGroups[phaseGroups.length - 1];
    if (last && last.phase === phase) {
      last.km += km;
      last.weeks += 1;
    } else {
      phaseGroups.push({ phase, km, weeks: 1 });
    }
  }
  const phases =
    phaseGroups.length >= 2 && phaseGroups.some((g) => g.km > 0)
      ? phaseGroups.map((g) => ({ ...g, km: positiveKm(g.km) }))
      : null;

  return {
    schemaVersion: PREP_RECAP_SCHEMA_VERSION,
    race,
    weeks,
    volume,
    sessions,
    streak: buildStreak(block, firstYmd, raceYmd, logs),
    longRuns,
    quality: qualityBlock,
    strongestWeek,
    phases,
    body: buildBody(input.recoveryDailyRows ?? [], firstYmd, raceYmd),
  };
}
