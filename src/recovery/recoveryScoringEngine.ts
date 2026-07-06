/**
 * Stabile Recovery-Scores — reine Logik, keine UI, keine HealthKit-Calls.
 * Dynamische Gewichtung wenn Teilmetriken fehlen; 7-Tage-Trend via EMA + Rolling-Blend.
 */

import { parseSessionDateLabel } from "../appSmartFeatures";
import { getAppNow } from "../core/time/timeSystem";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import {
  type DailyRecoveryComputed,
  type RecoveryConfidenceModel,
  type RecoveryDailyRow,
  type ScoreConfidence,
} from "./recoveryTypes";
import { daysBetweenInclusive, last7CalendarDays, parseYmd, ymd } from "./recoveryCalendarUtils";
import { buildDailyTrainingLoadByDate, trainingLoadSubscoreForDay } from "./trainingDailyLoad";
import { metaWeight } from "./signalMetaUtils";
import {
  blendLatentConfidence,
  computeConfidenceFromRVariance,
  computeGain,
  computeObservationNoiseLevel,
  computeObservedRecoveryProxy,
  computeVariance,
  defaultInitialLatentState,
  deriveScore,
} from "./latentRecoveryState";
import {
  aiReasoningModeFromSemantic,
  deriveSemanticUncertaintyState,
  insightDataModeFromSemantic,
} from "./recoverySemanticLayer";

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function activityLoadAdjustmentFromEnergyKcal(activeKcal: number | undefined, baselineKcal: number | null): number {
  if (activeKcal === undefined) return 0;
  if (!Number.isFinite(activeKcal) || activeKcal <= 0) return 0;
  if (baselineKcal === null || baselineKcal <= 0 || !Number.isFinite(baselineKcal)) return 0;
  // Relative deviation vs baseline; clamp tails and translate into a mild "load" adjustment.
  const rel = clamp((activeKcal - baselineKcal) / baselineKcal, -0.35, 1.1);
  // Scale into the same rough magnitude as a few km of training load (kept conservative).
  return rel * 6.5;
}

function weekDateBounds(week: PlanWeek): { first: Date | null; last: Date | null } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (const s of week.s ?? []) {
    const d = parseSessionDateLabel(s.date);
    if (!d) continue;
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return { first, last };
}

function earliestPlanSessionDate(plan: PlanWeek[]): Date | null {
  let best: Date | null = null;
  for (const w of plan) {
    for (const s of w.s ?? []) {
      const d = parseSessionDateLabel(s.date);
      if (!d) continue;
      if (!best || d < best) best = d;
    }
  }
  return best;
}

export function baselineValues(
  rowsByDate: Map<string, RecoveryDailyRow>,
  beforeYmd: string,
  windowDays: number,
  pick: (r: RecoveryDailyRow) => number | undefined,
): number[] {
  const end = parseYmd(beforeYmd);
  if (!end) return [];
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays);
  const vals: number[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const k = ymd(d);
    const v = pick(rowsByDate.get(k) || { date: k });
    if (v !== undefined && Number.isFinite(v)) vals.push(v);
  }
  return vals;
}

function sleepMidpointMinutes(startMin: number, endMin: number): number {
  let e = endMin;
  if (e < startMin) e += 24 * 60;
  return ((startMin + e) / 2) % (24 * 60);
}

function sleepSubscore(
  row: RecoveryDailyRow,
  baseSleepH: number | null,
  baseRemDeep: number | null,
  sleepDebtH: number,
  midpointStabilityPenalty: number,
): number | null {
  if (row.sleepHours === undefined) return null;
  const h = row.sleepHours;
  if (!baseSleepH || baseSleepH <= 0) {
    return clamp(52 + (h - 7) * 7 - sleepDebtH * 10 - midpointStabilityPenalty * 4, 28, 100);
  }
  const delta = h - baseSleepH;
  let s = 78 + delta * 14;
  if (row.sleepFragmentation !== undefined) {
    s -= row.sleepFragmentation * 28;
  }
  if (baseRemDeep && row.remDeepShare !== undefined) {
    s += (row.remDeepShare - baseRemDeep) * 22;
  }
  s -= sleepDebtH * 12;
  s -= midpointStabilityPenalty * 5;
  return clamp(s, 22, 100);
}

function hrvSubscore(val: number | undefined, base: number | null): number | null {
  if (val === undefined) return null;
  if (!base || base <= 0) return clamp(52 + (val - 45) * 0.55, 30, 100);
  const ratio = val / base;
  return clamp(68 + (ratio - 1) * 90, 28, 100);
}

function rhrSubscore(val: number | undefined, base: number | null): number | null {
  if (val === undefined) return null;
  if (!base || base <= 0) return clamp(88 - (val - 52) * 2.2, 35, 100);
  const ratio = base / val;
  return clamp(72 + (ratio - 1) * 55, 30, 100);
}

function respiratorySubscore(val: number | undefined, med: number | null, spread: number | null, skinDelta: number | undefined): number | null {
  if (val === undefined && skinDelta === undefined) return null;
  let s = 78;
  if (val !== undefined) {
    if (!med) s = 88 - Math.abs(val - 15) * 6;
    else {
      const dev = Math.abs(val - med);
      s = 88 - dev * 14;
      if (spread && spread > 0.35) s -= 6;
    }
  }
  if (skinDelta !== undefined) {
    s -= Math.min(12, Math.abs(skinDelta) * 40);
  }
  return clamp(s, 32, 100);
}

function sleepQualityWeightFromRow(row: RecoveryDailyRow, baseRemDeep: number | null): number {
  const frag = row.sleepFragmentation ?? 0;
  let w = 1 - frag * 0.42;
  if (baseRemDeep !== null && row.remDeepShare !== undefined) {
    w += (row.remDeepShare - baseRemDeep) * 0.35;
  }
  return clamp(w, 0.22, 1);
}

function last7RValues(endYmd: string, rByDate: Map<string, number>): number[] {
  const end = parseYmd(endYmd);
  if (!end) return [];
  const vals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    d.setDate(d.getDate() - i);
    const k = ymd(d);
    const r = rByDate.get(k);
    if (typeof r === "number" && Number.isFinite(r)) vals.push(r);
  }
  return vals;
}

function trailing7MetricValues(
  rowsByDate: Map<string, RecoveryDailyRow>,
  endYmd: string,
  pick: (r: RecoveryDailyRow) => number | undefined,
): number[] {
  const end = parseYmd(endYmd);
  if (!end) return [];
  const vals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    d.setDate(d.getDate() - i);
    const k = ymd(d);
    const v = pick(rowsByDate.get(k) || { date: k });
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  return vals;
}

function seriesStabilityHrvMs(vals: number[]): number {
  if (vals.length < 3) return 0.52;
  const m = mean(vals)!;
  if (Math.abs(m) < 1e-6) return 0.45;
  const sd = Math.sqrt(mean(vals.map((x) => (x - m) ** 2))!);
  const cv = sd / Math.abs(m);
  return clamp(1 - cv * 1.65, 0.12, 1);
}

function seriesStabilitySleepH(vals: number[]): number {
  if (vals.length < 3) return 0.52;
  const m = mean(vals)!;
  const sd = Math.sqrt(mean(vals.map((x) => (x - m) ** 2))!);
  return clamp(1 - sd / 2.85, 0.12, 1);
}

function seriesStabilityRhr(vals: number[]): number {
  if (vals.length < 3) return 0.52;
  const m = mean(vals)!;
  const sd = Math.sqrt(mean(vals.map((x) => (x - m) ** 2))!);
  return clamp(1 - sd / 7.5, 0.12, 1);
}

function buildRecoveryConfidenceModel(args: {
  row: RecoveryDailyRow;
  rowsByDate: Map<string, RecoveryDailyRow>;
  date: string;
}): RecoveryConfidenceModel {
  const { row, rowsByDate, date } = args;
  const sleepSlot = row.sleepHours !== undefined ? metaWeight(row.signalMeta?.sleep) : 0;
  const hrvSlot = row.hrvMs !== undefined ? metaWeight(row.signalMeta?.hrvMs) : 0;
  const rhrSlot = row.restingHr !== undefined ? metaWeight(row.signalMeta?.restingHr) : 0;
  const dataCompleteness = (sleepSlot + hrvSlot + rhrSlot) / 3;
  const presentW = [sleepSlot, hrvSlot, rhrSlot].filter((w) => w > 0);
  const signalQuality = presentW.length ? presentW.reduce((a, b) => a + b, 0) / presentW.length : 0;

  const hrv7 = trailing7MetricValues(rowsByDate, date, (r) => r.hrvMs);
  const sleep7 = trailing7MetricValues(rowsByDate, date, (r) => r.sleepHours);
  const rhr7 = trailing7MetricValues(rowsByDate, date, (r) => r.restingHr);
  const stabParts: number[] = [];
  if (hrv7.length >= 3) stabParts.push(seriesStabilityHrvMs(hrv7));
  if (sleep7.length >= 3) stabParts.push(seriesStabilitySleepH(sleep7));
  if (rhr7.length >= 3) stabParts.push(seriesStabilityRhr(rhr7));
  const physiologicalStability = stabParts.length ? mean(stabParts)! : 0.52;

  const overallConfidence = clamp(
    dataCompleteness * 0.34 + signalQuality * 0.33 + physiologicalStability * 0.33,
    0,
    1,
  );
  return { dataCompleteness, signalQuality, physiologicalStability, overallConfidence };
}

export function scoreConfidenceFromModel(overall: number, completeness: number): ScoreConfidence {
  if (overall >= 0.62 && completeness >= 0.5) return "full";
  if (overall >= 0.38) return "partial";
  return "insufficient";
}

/** Smoothing applied only to the latent R_t series — never to derived scores. */
function smoothLatentRTimeSeries(latentRs: number[]): number[] {
  if (latentRs.length === 0) return [];
  const alpha = 0.34;
  const ema: number[] = [];
  let e = latentRs[0];
  ema.push(e);
  for (let i = 1; i < latentRs.length; i++) {
    e = alpha * latentRs[i] + (1 - alpha) * e;
    ema.push(e);
  }
  const out: number[] = [];
  for (let i = 0; i < latentRs.length; i++) {
    const from = Math.max(0, i - 6);
    const window = latentRs.slice(from, i + 1);
    const roll = mean(window)!;
    const blended = 0.42 * ema[i] + 0.58 * roll;
    out.push(Math.round(clamp(blended, 0, 100)));
  }
  return out;
}

export function computeDailyRecoverySeries(
  rows: RecoveryDailyRow[],
  planWeekByYmd: Map<string, PlanWeek>,
  plan: PlanWeek[],
  logs: Record<string, SessionLog>,
  now: Date = getAppNow(),
): { series: DailyRecoveryComputed[]; rowsByDate: Map<string, RecoveryDailyRow> } {
  const rowsByDate = new Map(rows.map((r) => [r.date, r]));
  const trainingByDay = buildDailyTrainingLoadByDate(plan, logs);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let rangeStart: Date | null = null;
  for (const r of rows) {
    const d = parseYmd(r.date);
    if (d && d.getTime() <= todayStart.getTime() && (!rangeStart || d < rangeStart)) rangeStart = d;
  }
  for (const k of Array.from(trainingByDay.keys())) {
    const d = parseYmd(k);
    if (d && d.getTime() <= todayStart.getTime() && (!rangeStart || d < rangeStart)) rangeStart = d;
  }
  const planFirst = earliestPlanSessionDate(plan);
  if (planFirst) {
    const p0 = new Date(planFirst.getFullYear(), planFirst.getMonth(), planFirst.getDate());
    if (p0.getTime() <= todayStart.getTime() && (!rangeStart || p0 < rangeStart)) rangeStart = p0;
  }
  const roll7 = last7CalendarDays(now);
  const roll7First = parseYmd(roll7[0]!);
  if (roll7First && roll7First.getTime() <= todayStart.getTime() && (!rangeStart || roll7First < rangeStart)) {
    rangeStart = roll7First;
  }
  if (!rangeStart) rangeStart = todayStart;

  let allDays: string[];
  if (rangeStart.getTime() > todayStart.getTime()) {
    allDays = [ymd(todayStart)];
  } else {
    allDays = daysBetweenInclusive(rangeStart, todayStart);
  }
  if (allDays.length === 0) return { series: [], rowsByDate };

  type PrelimDay = {
    date: string;
    row: RecoveryDailyRow;
    dailyLoad: number;
    baseSleep: number | null;
    baseHrv: number | null;
    baseRhr: number | null;
    baseResp: number | null;
    baseRemDeep: number | null;
    recoveryConfidence: RecoveryConfidenceModel;
    sub: DailyRecoveryComputed["sub"];
    coverage: number;
  };

  const prelim: PrelimDay[] = [];

  for (const date of allDays) {
    const row = rowsByDate.get(date) ?? { date };
    const d = parseYmd(date);
    if (!d || d > todayStart) continue;

    const baseSleep = median(baselineValues(rowsByDate, date, 56, (r) => r.sleepHours));
    const baseHrv = median(baselineValues(rowsByDate, date, 42, (r) => r.hrvMs));
    const baseRhr = median(baselineValues(rowsByDate, date, 42, (r) => r.restingHr));
    const baseResp = median(baselineValues(rowsByDate, date, 28, (r) => r.respiratoryBrpm));
    const baseRemDeep = median(baselineValues(rowsByDate, date, 56, (r) => r.remDeepShare));
    const baseActiveEnergy = median(baselineValues(rowsByDate, date, 28, (r) => r.activeEnergyKcal));

    const midpoints = baselineValues(rowsByDate, date, 28, (r) =>
      r.sleepWindowStartMin !== undefined && r.sleepWindowEndMin !== undefined
        ? sleepMidpointMinutes(r.sleepWindowStartMin, r.sleepWindowEndMin)
        : undefined,
    );
    const baseMid = median(midpoints);
    let midpointPen = 0;
    if (
      baseMid !== null &&
      row.sleepWindowStartMin !== undefined &&
      row.sleepWindowEndMin !== undefined
    ) {
      const m = sleepMidpointMinutes(row.sleepWindowStartMin, row.sleepWindowEndMin);
      const diff = Math.abs(m - baseMid);
      const circ = Math.min(diff, 24 * 60 - diff);
      if (circ > 70) midpointPen = Math.min(3, (circ - 70) / 40);
    }

    let sleepDebtH = 0;
    if (baseSleep && row.sleepHours !== undefined) {
      sleepDebtH = Math.max(0, baseSleep - row.sleepHours);
    }

    const respSpread =
      mean(
        baselineValues(rowsByDate, date, 14, (r) => r.respiratoryBrpm).map((x) =>
          Math.abs(x - (baseResp || x)),
        ),
      ) || null;

    const dailyLoad = trainingByDay.get(date) ?? 0;
    const activityAdj = activityLoadAdjustmentFromEnergyKcal(row.activeEnergyKcal, baseActiveEnergy);
    const effectiveLoad = Math.max(0, dailyLoad + activityAdj);
    const trainingLoad = trainingLoadSubscoreForDay(effectiveLoad);

    const sleep = sleepSubscore(row, baseSleep, baseRemDeep, sleepDebtH, midpointPen);
    const hrv = hrvSubscore(row.hrvMs, baseHrv);
    const restingHr = rhrSubscore(row.restingHr, baseRhr);
    const respiratory = respiratorySubscore(row.respiratoryBrpm, baseResp, respSpread, row.wristTempDeltaC);

    const hasSleep = row.sleepHours !== undefined;
    const hasHrv = row.hrvMs !== undefined;
    const hasRhr = row.restingHr !== undefined;
    const corePresent = [hasSleep, hasHrv, hasRhr].filter(Boolean).length;

    const recoveryConfidence = buildRecoveryConfidenceModel({ row, rowsByDate, date });
    const coverage = corePresent / 3;

    const sub: DailyRecoveryComputed["sub"] = { trainingLoad };
    if (sleep !== null) sub.sleep = sleep;
    if (hrv !== null) sub.hrv = hrv;
    if (restingHr !== null) sub.restingHr = restingHr;
    if (respiratory !== null) sub.respiratory = respiratory;

    prelim.push({
      date,
      row,
      dailyLoad: effectiveLoad,
      baseSleep,
      baseHrv,
      baseRhr,
      baseResp,
      baseRemDeep,
      recoveryConfidence,
      sub,
      coverage,
    });
  }

  let latentState = defaultInitialLatentState();
  const rByDate = new Map<string, number>();
  type WithLatent = PrelimDay & {
    latentR: number;
    observedRecoveryProxy: number;
    latentK: number;
  };
  const withLatent: WithLatent[] = [];

  for (const p of prelim) {
    const baselineVec = {
      sleep: p.baseSleep ?? 7,
      hrv: Math.max(p.baseHrv ?? 50, 1e-6),
      rhr: p.baseRhr ?? 55,
      respirationMedian: p.baseResp,
    };
    const sqw = sleepQualityWeightFromRow(p.row, p.baseRemDeep);
    const obs = {
      sleep: p.row.sleepHours ?? baselineVec.sleep,
      hrv: p.row.hrvMs ?? baselineVec.hrv,
      rhr: p.row.restingHr ?? baselineVec.rhr,
      trainingLoad: p.dailyLoad,
      respiration: p.row.respiratoryBrpm ?? baselineVec.respirationMedian ?? 15,
    };
    const observedRecoveryProxy = computeObservedRecoveryProxy(obs, baselineVec, sqw, latentState.R);
    const latentK = computeGain(latentState.meta);
    const newR = latentState.R + latentK * (observedRecoveryProxy - latentState.R);
    const rc = p.recoveryConfidence;
    latentState = {
      R: clamp(newR, 0, 100),
      meta: {
        baseConfidence: rc.overallConfidence,
        physiologicalStability: rc.physiologicalStability,
      },
    };
    rByDate.set(p.date, latentState.R);
    withLatent.push({
      ...p,
      latentR: latentState.R,
      observedRecoveryProxy,
      latentK,
    });
  }

  const rawList: { date: string; meta: Omit<DailyRecoveryComputed, "smoothedLatentR"> }[] = [];

  for (const p of withLatent) {
    const r7 = last7RValues(p.date, rByDate);
    const rVariance7d = computeVariance(r7);
    const varianceConfidence = computeConfidenceFromRVariance(r7);
    const observationNoise = computeObservationNoiseLevel(
      p.recoveryConfidence.signalQuality,
      p.recoveryConfidence.dataCompleteness,
    );
    const overallConfidence = blendLatentConfidence(
      varianceConfidence,
      p.recoveryConfidence.dataCompleteness,
      p.recoveryConfidence.signalQuality,
      observationNoise,
    );
    const recoveryConfidence: RecoveryConfidenceModel = {
      ...p.recoveryConfidence,
      overallConfidence,
    };
    const rawScore = deriveScore(p.latentR);
    const score = rawScore;
    const sc = scoreConfidenceFromModel(overallConfidence, recoveryConfidence.dataCompleteness);
    const semanticUncertaintyState = deriveSemanticUncertaintyState(recoveryConfidence, {
      rVariance7d,
    });
    const aiReasoningMode = aiReasoningModeFromSemantic(semanticUncertaintyState);
    const insightDataMode = insightDataModeFromSemantic(semanticUncertaintyState);

    rawList.push({
      date: p.date,
      meta: {
        date: p.date,
        latentR: p.latentR,
        observedRecoveryProxy: p.observedRecoveryProxy,
        latentK: p.latentK,
        rawScore,
        score,
        sub: p.sub,
        coverage: p.coverage,
        scoreConfidence: sc,
        recoveryConfidence,
        insightDataMode,
        semanticUncertaintyState,
        aiReasoningMode,
      },
    });
  }

  const smoothedLatentSeries = smoothLatentRTimeSeries(rawList.map((x) => x.meta.latentR));
  const series: DailyRecoveryComputed[] = rawList.map((x, i) => ({
    ...x.meta,
    smoothedLatentR: smoothedLatentSeries[i] ?? x.meta.latentR,
  }));

  return { series, rowsByDate };
}

export function buildPlanWeekToDateMap(plan: PlanWeek[]): Map<string, PlanWeek> {
  const m = new Map<string, PlanWeek>();
  for (const w of plan) {
    const { first, last } = weekDateBounds(w);
    if (!first || !last) continue;
    for (const y of daysBetweenInclusive(first, last)) {
      m.set(y, w);
    }
  }
  return m;
}
