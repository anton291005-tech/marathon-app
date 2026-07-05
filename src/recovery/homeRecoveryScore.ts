/**
 * Home KPI: Recovery Score (0–100) — rolling 7 calendar days ending today.
 * Not anchored to Monday or plan week; independent of weekly aggregation.
 */

import { isSessionLogDone, parseSessionDateLabel } from "../appSmartFeatures";
import { getAppNow } from "../core/time/timeSystem";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type { DailyRecoveryComputed } from "./recoveryTypes";
import { last7CalendarDays, ymd } from "./recoveryCalendarUtils";
import { buildDailyTrainingLoadByDate } from "./trainingDailyLoad";
import {
  applyTrainingConsistencyGuard,
  type RecoveryScoreContributingFactorsLog,
} from "./recoveryScoreDebug";

const MAX_SCORE_DELTA_NORMAL = 6;
const MAX_SCORE_DELTA_EXTREME = 14;
const TODAY_TRAINING_EXTREME_PENALTY = -8;
const SLEEP_SUBSCORE_BAD_THRESHOLD = 38;
const INERTIA_PREV = 0.7;
const INERTIA_NEXT = 0.3;

function weightedAverage(pairs: { value: number; weight: number }[]): number {
  let num = 0;
  let den = 0;
  for (const { value, weight } of pairs) {
    if (weight <= 0 || !Number.isFinite(value)) continue;
    num += value * weight;
    den += weight;
  }
  return den > 0 ? num / den : 50;
}

function isExtremeRecoveryShift(args: { todayTrainingPenalty: number; sleepAvg: number | null }): boolean {
  if (args.todayTrainingPenalty < TODAY_TRAINING_EXTREME_PENALTY) return true;
  if (args.sleepAvg != null && Number.isFinite(args.sleepAvg) && args.sleepAvg < SLEEP_SUBSCORE_BAD_THRESHOLD) {
    return true;
  }
  return false;
}

/** Kalibrierter Vortag / gleicher Tag — kein useRef; kommt aus `homeScoreByDay`. */
export type HomeRecoveryStabilityContext = {
  trainingGuardPreviousScore: number | null;
  stabilityClampAnchor: number | null;
  /** Nur wenn heute schon ein Wert gespeichert war: Intra-Day-EMA; sonst null (kein „Mitziehen“ über Tageswechsel). */
  inertiaIntraDayPreviousScore: number | null;
  /**
   * Kalendertag des gespeicherten Intra-Day-Werts — EMA nur wenn gleicher Tag wie `now` (kein Cross-Day-Inertia).
   */
  intraDayAnchorCalendarYmd?: string | null;
};

function resolveHomeRecoveryStability(
  args: {
    stabilityContext?: HomeRecoveryStabilityContext;
    /** @deprecated Nur Tests / Legacy: setzt alle drei Kontexte gleich. */
    previousHomeScore?: number | null;
  },
): HomeRecoveryStabilityContext {
  if (args.stabilityContext) {
    return args.stabilityContext;
  }
  const leg = args.previousHomeScore ?? null;
  return {
    trainingGuardPreviousScore: leg,
    stabilityClampAnchor: leg,
    inertiaIntraDayPreviousScore: leg,
    intraDayAnchorCalendarYmd: null,
  };
}

function warnIfBreakdownAdditiveMismatch(cf: RecoveryScoreContributingFactorsLog, rawBeforeRound: number): void {
  const reconstructed =
    cf.base + cf.executionNudge + cf.trainingPenalty + cf.todayTrainingPenalty;
  if (!Number.isFinite(reconstructed) || !Number.isFinite(rawBeforeRound)) return;
  if (Math.abs(reconstructed - rawBeforeRound) > 0.05) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line no-console
    console.warn("Recovery breakdown additive mismatch", {
      reconstructed,
      rawBeforeRound,
      base: cf.base,
      executionNudge: cf.executionNudge,
      trainingPenalty: cf.trainingPenalty,
      todayTrainingPenalty: cf.todayTrainingPenalty,
    });
  }
}


export type HomeRecoveryScoreResult = {
  score: number;
  windowStartYmd: string;
  windowEndYmd: string;
};

export type HomeRecoveryScoreBreakdown = HomeRecoveryScoreResult & {
  contributingFactors: RecoveryScoreContributingFactorsLog;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sessionToYmd(session: { date: string }, year = 2026): string | null {
  const d = parseSessionDateLabel(session.date, year);
  if (!d) return null;
  return ymd(d);
}

/** Non-rest sessions in plan whose calendar day falls in `window` and is on/before today. */
function rollingPlanExecutionRatio(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  windowYmds: string[];
  todayYmd: string;
}): { ratio: number; weight: number } {
  const set = new Set(args.windowYmds.filter((d) => d <= args.todayYmd));
  let due = 0;
  let done = 0;
  for (const w of args.plan) {
    for (const s of w.s) {
      if (s.type === "rest") continue;
      const d = sessionToYmd(s);
      if (!d || !set.has(d)) continue;
      due += 1;
      if (isSessionLogDone(args.logs[s.id])) done += 1;
    }
  }
  if (due === 0) return { ratio: 1, weight: 0 };
  return { ratio: done / due, weight: Math.min(1, due / 5) };
}

/** Same load units as Home-Recovery-Score (`buildDailyTrainingLoadByDate`). */
export type RecoveryLoadSnapshot = {
  todayLoad: number;
  /** Acute (7d) vs prior 7d ratio minus 1 — identical to Home score load nudge input. */
  acuteChronicDelta: number;
};

/** Load context for recovery insight copy — shared with Home KPI penalties. */
export function computeRecoveryLoadSnapshot(args: {
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
}): RecoveryLoadSnapshot {
  const now = args.now ?? getAppNow();
  const loads = buildDailyTrainingLoadByDate(args.plan, args.logs);
  const todayYmd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  return {
    todayLoad: loads.get(todayYmd) ?? 0,
    acuteChronicDelta: acuteChronicLoadDelta(loads, now),
  };
}

/**
 * Acute (last 7d) vs chronic (prior 7d) total training stress — same units as `buildDailyTrainingLoadByDate`.
 */
function acuteChronicLoadDelta(loads: Map<string, number>, now: Date): number {
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let acute = 0;
  let chronic = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(t0);
    d.setDate(t0.getDate() - i);
    acute += loads.get(ymd(d)) ?? 0;
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(t0);
    d.setDate(t0.getDate() - i);
    chronic += loads.get(ymd(d)) ?? 0;
  }
  if (chronic < 0.5 && acute < 0.5) return 0;
  const denom = chronic > 0.25 ? chronic : Math.max(acute, 0.01);
  return acute / denom - 1;
}

/**
 * Confidence-weighted, recency-weighted blend of smoothed latent R over the rolling window.
 * Missing days use neutral 50 with a low prior weight to avoid jumps when the series is short.
 */
function weightedLatentFromWindow(
  last7: string[],
  byDate: Map<string, DailyRecoveryComputed>,
): number {
  let num = 0;
  let den = 0;
  last7.forEach((date, i) => {
    const recency = (i + 1) / 7;
    const row = byDate.get(date);
    const conf = row ? clamp(row.recoveryConfidence.overallConfidence, 0.2, 1) : 0.32;
    const w = recency * conf;
    const r = row ? row.smoothedLatentR : 50;
    num += w * r;
    den += w;
  });
  return den > 0 ? num / den : 50;
}

function meanOverallConfidenceInWindow(last7: string[], byDate: Map<string, DailyRecoveryComputed>): number {
  const vals = last7
    .map((d) => byDate.get(d)?.recoveryConfidence.overallConfidence)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return 0.32;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function meanSubInWindow(
  last7: string[],
  byDate: Map<string, DailyRecoveryComputed>,
  pick: (row: DailyRecoveryComputed) => number | undefined,
): number | null {
  const vals: number[] = [];
  for (const d of last7) {
    const row = byDate.get(d);
    if (!row) continue;
    const v = pick(row);
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeHomeRecoveryScoreInternal(args: {
  series: DailyRecoveryComputed[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
  stabilityContext?: HomeRecoveryStabilityContext;
  /** @deprecated Ersetzt durch `stabilityContext` aus Tages-Map. */
  previousHomeScore?: number | null;
  /**
   * `false` nur beim allerersten gültigen KPI (Cold Start): leichter Blend Richtung 50.
   * Danach `true` (persistiert in der App).
   */
  hasEverComputedRecoveryScore?: boolean;
}): HomeRecoveryScoreBreakdown {
  const now = args.now ?? getAppNow();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayYmd = ymd(todayStart);
  const last7 = last7CalendarDays(now);
  const windowStartYmd = last7[0]!;
  const windowEndYmd = last7[last7.length - 1]!;

  const byDate = new Map(args.series.map((s) => [s.date, s]));

  const present = last7.filter((d) => byDate.has(d));
  const flatMean =
    present.length > 0 ? present.reduce((a, d) => a + (byDate.get(d)!.smoothedLatentR || 0), 0) / present.length : 50;

  const weighted = weightedLatentFromWindow(last7, byDate);
  const blendedLatent = 0.72 * weighted + 0.28 * flatMean;
  const smoothing = blendedLatent - weighted;

  const sleepAvg = meanSubInWindow(last7, byDate, (row) => row.sub.sleep);
  const hrvAvg = meanSubInWindow(last7, byDate, (row) => row.sub.hrv);
  const rhrAvg = meanSubInWindow(last7, byDate, (row) => row.sub.restingHr);

  const { ratio: execRatio, weight: execWeight } = rollingPlanExecutionRatio({
    plan: args.plan,
    logs: args.logs,
    windowYmds: last7,
    todayYmd,
  });
  /** Nur Abschläge wenn hinter dem Plan — nie positiver „Bonus“ fürs Abhaken (würde Recovery künstlich hochtreiben). */
  const executionNudge = execWeight > 0 ? Math.min(0, (execRatio - 0.85) * 10 * execWeight) : 0;

  const loads = buildDailyTrainingLoadByDate(args.plan, args.logs);
  const loadSkew = acuteChronicLoadDelta(loads, now);
  let loadNudge = 0;
  if (loadSkew > 0.12) loadNudge = -Math.min(7, loadSkew * 28);
  else if (loadSkew < -0.1) loadNudge = Math.min(4, -loadSkew * 18);

  const todayLoad = loads.get(todayYmd) ?? 0;
  const todayTrainingPenalty = -Math.min(16, todayLoad * 0.48);

  const raw = blendedLatent + executionNudge + loadNudge + todayTrainingPenalty;
  const roundedModel = Math.round(clamp(raw, 0, 100));

  const confidenceWeight = meanOverallConfidenceInWindow(last7, byDate);

  const contributingFactors: RecoveryScoreContributingFactorsLog = {
    base: blendedLatent,
    sleep: sleepAvg,
    hrv: hrvAvg,
    restingHR: rhrAvg,
    trainingPenalty: loadNudge,
    todayTrainingPenalty,
    executionNudge,
    smoothing,
    finalScore: roundedModel,
    todayLoadUnits: todayLoad,
    weightedLatentR: weighted,
    flatMeanLatentR: flatMean,
    executionRatio: execRatio,
    confidenceWeight,
    loadNudge,
    smoothedLatentR: blendedLatent,
    weeklyBlendEffect: smoothing,
  };

  warnIfBreakdownAdditiveMismatch(contributingFactors, raw);

  const stab = resolveHomeRecoveryStability(args);

  const guarded = applyTrainingConsistencyGuard({
    previousScore: stab.trainingGuardPreviousScore,
    nextScore: roundedModel,
    todayTrainingPenalty,
  });
  let score = guarded.score;
  contributingFactors.finalScore = score;
  contributingFactors.scoreAfterModelGuards = score;

  const hasEver = args.hasEverComputedRecoveryScore !== false;
  if (!hasEver) {
    score = Math.round(
      weightedAverage([
        { value: 50, weight: 0.3 },
        { value: score, weight: 0.7 },
      ]),
    );
  } else if (stab.stabilityClampAnchor != null && Number.isFinite(stab.stabilityClampAnchor)) {
    const anchor = stab.stabilityClampAnchor;
    const extreme = isExtremeRecoveryShift({ todayTrainingPenalty, sleepAvg });
    const maxD = extreme ? MAX_SCORE_DELTA_EXTREME : MAX_SCORE_DELTA_NORMAL;
    const clamped = clamp(score, anchor - maxD, anchor + maxD);
    if (extreme) {
      score = clamped;
    } else if (
      stab.inertiaIntraDayPreviousScore != null &&
      Number.isFinite(stab.inertiaIntraDayPreviousScore) &&
      (stab.intraDayAnchorCalendarYmd == null || stab.intraDayAnchorCalendarYmd === todayYmd)
    ) {
      score = Math.round(
        INERTIA_PREV * stab.inertiaIntraDayPreviousScore + INERTIA_NEXT * clamped,
      );
    } else {
      score = clamped;
    }
  }

  contributingFactors.finalScore = score;

  return {
    score,
    windowStartYmd,
    windowEndYmd,
    contributingFactors,
  };
}

/** Same inputs/outputs as before; delegates to shared implementation. */
export function computeHomeRecoveryScore(args: {
  series: DailyRecoveryComputed[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
  stabilityContext?: HomeRecoveryStabilityContext;
  previousHomeScore?: number | null;
  hasEverComputedRecoveryScore?: boolean;
}): HomeRecoveryScoreResult {
  const b = computeHomeRecoveryScoreInternal(args);
  return {
    score: b.score,
    windowStartYmd: b.windowStartYmd,
    windowEndYmd: b.windowEndYmd,
  };
}

export type HomeRecoveryInputs = {
  sleepHours: number | null;
  hrvMs: number | null;
  restingHr: number | null;
  activeEnergyKcal: number | null;
};

function clamp01(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreSleepHoursFromInputs(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  if (h < 4) return 18;
  if (h < 6) return clamp01(25 + (h - 4) * 15, 0, 100);
  if (h < 7.5) return clamp01(55 + (h - 6) * 15.3, 0, 100);
  if (h < 9) return clamp01(78 + (h - 7.5) * 6.7, 0, 100);
  if (h < 10.5) return clamp01(88 - (h - 9) * 4, 0, 100);
  return 70;
}

function scoreHrvMsFromInputs(hrv: number): number {
  if (!Number.isFinite(hrv) || hrv <= 0) return 0;
  if (hrv < 25) return 28;
  if (hrv < 45) return clamp01(35 + (hrv - 25) * 1.25, 0, 100);
  if (hrv < 70) return clamp01(60 + (hrv - 45) * 0.72, 0, 100);
  if (hrv < 100) return clamp01(78 + (hrv - 70) * 0.4, 0, 100);
  return 90;
}

function scoreRestingHrFromInputs(rhr: number): number {
  if (!Number.isFinite(rhr) || rhr <= 0) return 0;
  if (rhr <= 45) return 88;
  if (rhr <= 55) return clamp01(88 - (rhr - 45) * 1.3, 0, 100);
  if (rhr <= 65) return clamp01(75 - (rhr - 55) * 1.5, 0, 100);
  if (rhr <= 75) return clamp01(60 - (rhr - 65) * 1.5, 0, 100);
  if (rhr <= 85) return clamp01(45 - (rhr - 75) * 1.0, 0, 100);
  return 30;
}

function loadScoreFromActiveEnergyKcalFromInputs(kcal: number): number {
  const penalty = Math.min(75, kcal / 20);
  return clamp01(100 - penalty, 0, 100);
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Normalize raw HealthKit / storage payloads before stateless scoring. */
export function normalizeHomeRecoveryInputs(raw: unknown): HomeRecoveryInputs {
  const empty: HomeRecoveryInputs = {
    sleepHours: null,
    hrvMs: null,
    restingHr: null,
    activeEnergyKcal: null,
  };
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const o = raw as Record<string, unknown>;
  return {
    sleepHours: finiteOrNull(o.sleepHours),
    hrvMs: finiteOrNull(o.hrvMs),
    restingHr: finiteOrNull(o.restingHr),
    activeEnergyKcal: finiteOrNull(o.activeEnergyKcal),
  };
}

/** Stateless home KPI from today's raw inputs (null when sleep + (HRV or RHR) missing). */
export function computeHomeRecoveryScoreFromInputs(inputs: HomeRecoveryInputs): number | null {
  const sleepHours = inputs.sleepHours;
  const hrvMs = inputs.hrvMs;
  const restingHr = inputs.restingHr;
  const hasSleep = typeof sleepHours === "number" && Number.isFinite(sleepHours);
  const hasHrv = typeof hrvMs === "number" && Number.isFinite(hrvMs);
  const hasRhr = typeof restingHr === "number" && Number.isFinite(restingHr);
  if (!hasSleep || (!hasHrv && !hasRhr)) return null;

  const sleepScore = scoreSleepHoursFromInputs(sleepHours as number);
  const physioScore = hasHrv
    ? scoreHrvMsFromInputs(hrvMs as number)
    : scoreRestingHrFromInputs(restingHr as number);
  const kcal = inputs.activeEnergyKcal;
  const loadScore =
    typeof kcal === "number" && Number.isFinite(kcal)
      ? loadScoreFromActiveEnergyKcalFromInputs(kcal)
      : 100;
  return Math.round(0.4 * sleepScore + 0.4 * physioScore + 0.2 * loadScore);
}

/** Debug: intermediate factors for the home KPI (formula identical to `computeHomeRecoveryScore`). */
export function computeHomeRecoveryScoreBreakdown(args: {
  series: DailyRecoveryComputed[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
  stabilityContext?: HomeRecoveryStabilityContext;
  previousHomeScore?: number | null;
  hasEverComputedRecoveryScore?: boolean;
}): HomeRecoveryScoreBreakdown {
  return computeHomeRecoveryScoreInternal(args);
}
