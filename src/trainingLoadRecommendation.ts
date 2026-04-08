/**
 * Deterministic training load / next-day recovery hint from recent completed runs.
 * Pure functions — no UI, no API, no plan mutation.
 */

import { isSessionLogDone, normalizeCalendarDay, parseSessionDateLabel } from "./appSmartFeatures";
import type { PlanSession, PlanWeek, SessionLog } from "./marathonPrediction";

const RUNNING_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

export type TrainingLoadStatus = "green" | "yellow" | "red";

export type TrainingLoadRecommendation = {
  status: TrainingLoadStatus;
  label: string;
  feedback: string;
  basedOnDate: string;
  updatedAt: string;
};

/** One completed running session with local calendar day */
export type CompletedRunSnapshot = {
  sessionId: string;
  /** YYYY-MM-DD (local, from plan session date) */
  date: string;
  log: SessionLog;
  sessionType: string;
};

function planSessionLocalYmd(session: PlanSession): string | null {
  const pd = parseSessionDateLabel(session.date);
  if (!pd) return null;
  const x = normalizeCalendarDay(pd);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function runCompletionSortTime(log: SessionLog): number {
  const a = log.at ? Date.parse(log.at) : NaN;
  if (Number.isFinite(a)) return a;
  const b = log.assignedRun?.startDate ? Date.parse(log.assignedRun.startDate) : NaN;
  if (Number.isFinite(b)) return b;
  const c = log.runEvaluation?.updatedAt ? Date.parse(log.runEvaluation.updatedAt) : NaN;
  return Number.isFinite(c) ? c : 0;
}

function evalStatus(log: SessionLog): string | undefined {
  return log.runEvaluation?.status;
}

function distanceDelta(log: SessionLog): number {
  const d = log.runEvaluation?.distanceDeltaKm;
  return typeof d === "number" && Number.isFinite(d) ? d : 0;
}

function ymdToUtcMidnightMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  return Date.UTC(y, m - 1, d);
}

function collectCompletedRunningRows(
  planSessions: PlanSession[],
  logs: Record<string, SessionLog | undefined>,
  options: { maxDateYmdInclusive: string | null },
): CompletedRunSnapshot[] {
  const rows: CompletedRunSnapshot[] = [];
  const cap = options.maxDateYmdInclusive ? ymdToUtcMidnightMs(options.maxDateYmdInclusive) : NaN;

  for (const s of planSessions) {
    if (!RUNNING_TYPES.has(s.type)) continue;
    const log = logs[s.id];
    if (!log || !isSessionLogDone(log)) continue;
    const ymd = planSessionLocalYmd(s);
    if (!ymd) continue;
    if (Number.isFinite(cap)) {
      const rowT = ymdToUtcMidnightMs(ymd);
      if (!Number.isFinite(rowT) || rowT > cap) continue;
    }
    rows.push({ sessionId: s.id, date: ymd, log, sessionType: s.type });
  }
  return rows;
}

function sortRunRowsDesc(rows: CompletedRunSnapshot[]): void {
  rows.sort((a, b) => {
    const ta = ymdToUtcMidnightMs(a.date);
    const tb = ymdToUtcMidnightMs(b.date);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return runCompletionSortTime(b.log) - runCompletionSortTime(a.log);
  });
}

/**
 * Completed running sessions (plan type in RUNNING_TYPES, log done), newest first.
 * 1) Strict: session local date on or before `todayYmd` (handles lexicographic YYYY-MM-DD vs calendar).
 * 2) Relaxed: if strict is empty (common when plan uses year 2026 but device clock is still 2025),
 *    use all completed runs in the plan so the feature stays usable in dev / year skew.
 */
export function getRecentRelevantRuns(
  planSessions: PlanSession[],
  logs: Record<string, SessionLog | undefined>,
  todayYmd: string,
): { primaryRun: CompletedRunSnapshot; secondaryRun: CompletedRunSnapshot | null } | null {
  const logIds = Object.keys(logs || {});
  const doneRunningPreview = planSessions.filter((s) => {
    if (!RUNNING_TYPES.has(s.type)) return false;
    const lg = logs[s.id];
    return !!(lg && isSessionLogDone(lg));
  }).length;

  console.log("Recovery input logs:", {
    logEntryCount: logIds.length,
    doneRunningSessionCount: doneRunningPreview,
    todayYmd,
  });

  let rows = collectCompletedRunningRows(planSessions, logs, { maxDateYmdInclusive: todayYmd });
  console.log("Recovery strict row count (on/before today):", rows.length);

  if (rows.length === 0) {
    rows = collectCompletedRunningRows(planSessions, logs, { maxDateYmdInclusive: null });
    console.log(
      "Recovery: using relaxed window (no on/before-today matches — often plan year vs device date). Row count:",
      rows.length,
    );
  }

  if (rows.length === 0) {
    console.log("Recovery primaryRun: null (no qualifying completed run)");
    console.log("Recovery secondaryRun: null");
    return null;
  }

  sortRunRowsDesc(rows);

  const primaryRun = rows[0];
  const secondaryRun = rows.length > 1 ? rows[1] : null;

  console.log("Recovery primaryRun:", primaryRun);
  console.log("Recovery secondaryRun:", secondaryRun);

  return { primaryRun, secondaryRun };
}

/**
 * Ordered heuristics: RED → YELLOW → GREEN.
 */
export function classifyLoad(
  primaryRun: CompletedRunSnapshot,
  secondaryRun: CompletedRunSnapshot | null,
): TrainingLoadStatus {
  const pe = evalStatus(primaryRun.log);
  const pd = distanceDelta(primaryRun.log);

  const primaryMild = pe === "too_fast_easy" || pe === "long";
  const se = secondaryRun ? evalStatus(secondaryRun.log) : undefined;
  const secondaryMild = se === "too_fast_easy" || se === "long";

  if (pe === "too_hard") return "red";
  if (pe === "too_fast_easy" && pd > 1) return "red";
  if (pe === "long" && pd > 2) return "red";
  if (pd >= 3) return "red";
  if (primaryMild && secondaryMild) return "red";

  if (pe === "too_fast_easy") return "yellow";
  if (pe === "long") return "yellow";

  const ad = Math.abs(pd);
  if (ad >= 0.8 && ad <= 2 && (pe === "perfect" || pe === "good" || pe === undefined)) {
    return "yellow";
  }

  if (pe === "perfect" || pe === "good" || pe === undefined) return "green";
  if (pe === "short" || pe === "too_easy") return "green";
  if (pe === "no_match") return "green";

  return "green";
}

export function getLoadLabel(status: TrainingLoadStatus): string {
  switch (status) {
    case "green":
      return "Im Rahmen";
    case "yellow":
      return "Etwas erhöht";
    case "red":
      return "Zu hoch";
    default:
      return "Im Rahmen";
  }
}

export function getLoadFeedback(
  status: TrainingLoadStatus,
  context: { isRestDayToday: boolean },
): string {
  let base: string;
  switch (status) {
    case "green":
      base = "Belastung zuletzt im Rahmen. Heute kannst du den Plan normal umsetzen.";
      break;
    case "yellow":
      base = "Belastung zuletzt etwas erhöht. Heute lieber bewusst locker bleiben.";
      break;
    case "red":
      base = "Belastung zuletzt klar zu hoch. Regeneration priorisieren.";
      break;
    default:
      base = "Belastung zuletzt im Rahmen. Heute kannst du den Plan normal umsetzen.";
  }
  if (context.isRestDayToday) {
    return `${base} Der Ruhetag heute passt gut.`;
  }
  return base;
}

/** True when no running session is scheduled on this local day (nur Ruhe/Kraft/Rad/leer). */
export function isRunningRestDay(plan: PlanWeek[], todayYmd: string): boolean {
  const onDay: PlanSession[] = [];
  for (const week of plan) {
    for (const s of week.s) {
      const ymd = planSessionLocalYmd(s);
      if (ymd === todayYmd) onDay.push(s);
    }
  }
  if (onDay.length === 0) return true;
  return !onDay.some((s) => RUNNING_TYPES.has(s.type));
}

export type GetTrainingLoadRecommendationParams = {
  plan: PlanWeek[];
  logs: Record<string, SessionLog | undefined>;
  /** Local calendar day YYYY-MM-DD */
  today: string;
};

/** Shown when no qualifying completed run exists — keeps UI and tests stable (never null from the public API). */
export function buildTrainingLoadFallbackRecommendation(todayYmd: string): TrainingLoadRecommendation {
  return {
    status: "green",
    label: "Noch keine Basis",
    feedback: "Sobald ein passender Lauf vorliegt, erscheint hier eine Trainings-Empfehlung.",
    basedOnDate: todayYmd,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Derives next-day style recovery hint from the most recent completed run(s).
 * Uses `SessionLog` + plan session dates only (no separate SessionLog.date field).
 * Always returns a value; uses {@link buildTrainingLoadFallbackRecommendation} when no run qualifies.
 */
export function getTrainingLoadRecommendation(
  params: GetTrainingLoadRecommendationParams,
): TrainingLoadRecommendation {
  console.log("getTrainingLoadRecommendation called", {
    planWeeks: params.plan.length,
    today: params.today,
  });
  const planSessions = params.plan.flatMap((w) => w.s);
  const recent = getRecentRelevantRuns(planSessions, params.logs, params.today);
  if (!recent) {
    const fallback = buildTrainingLoadFallbackRecommendation(params.today);
    console.log("Recovery computed recommendation: fallback (no primary run)", fallback);
    return fallback;
  }

  const { primaryRun, secondaryRun } = recent;
  const status = classifyLoad(primaryRun, secondaryRun);
  console.log("Recovery status:", status);

  const isRestDayToday = isRunningRestDay(params.plan, params.today);
  const label = getLoadLabel(status);
  const feedback = getLoadFeedback(status, { isRestDayToday: isRestDayToday });

  const rec: TrainingLoadRecommendation = {
    status,
    label,
    feedback,
    basedOnDate: primaryRun.date,
    updatedAt: new Date().toISOString(),
  };
  console.log("Recovery computed recommendation:", rec);
  return rec;
}
