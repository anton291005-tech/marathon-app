import type { HomeRecoveryInputs } from "./homeRecoveryScore";
import type { RecoveryDailyRow } from "./recoveryTypes";
import { parseYmd } from "./recoveryCalendarUtils";
import { buildDailyTrainingLoadByDate, trainingLoadSubscoreForDay } from "./trainingDailyLoad";
import type { PlanWeek, SessionLog } from "../marathonPrediction";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreSleepHours(h: number): number {
  if (!Number.isFinite(h) || h <= 0) return 0;
  if (h < 4) return 18;
  if (h < 6) return clamp(25 + (h - 4) * 15, 0, 100);
  if (h < 7.5) return clamp(55 + (h - 6) * 15.3, 0, 100);
  if (h < 9) return clamp(78 + (h - 7.5) * 6.7, 0, 100);
  if (h < 10.5) return clamp(88 - (h - 9) * 4, 0, 100);
  return 70;
}

function scoreHrvMs(hrv: number): number {
  if (!Number.isFinite(hrv) || hrv <= 0) return 0;
  if (hrv < 25) return 28;
  if (hrv < 45) return clamp(35 + (hrv - 25) * 1.25, 0, 100);
  if (hrv < 70) return clamp(60 + (hrv - 45) * 0.72, 0, 100);
  if (hrv < 100) return clamp(78 + (hrv - 70) * 0.4, 0, 100);
  return 90;
}

function scoreRestingHr(rhr: number): number {
  if (!Number.isFinite(rhr) || rhr <= 0) return 0;
  if (rhr <= 45) return 88;
  if (rhr <= 55) return clamp(88 - (rhr - 45) * 1.3, 0, 100);
  if (rhr <= 65) return clamp(75 - (rhr - 55) * 1.5, 0, 100);
  if (rhr <= 75) return clamp(60 - (rhr - 65) * 1.5, 0, 100);
  if (rhr <= 85) return clamp(45 - (rhr - 75) * 1.0, 0, 100);
  return 30;
}

function loadScoreFromActiveEnergyKcal(kcal: number): number {
  // Deterministic inverse load proxy (0–100). Chosen to keep typical days in a reasonable band.
  // 0 kcal -> 100, 600 kcal -> ~70, 1200 kcal -> ~40, >=1500 kcal -> 25 floor before clamp.
  const penalty = Math.min(75, kcal / 20);
  return clamp(100 - penalty, 0, 100);
}

function mean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function trendArrow(first: number | null, last: number | null): "↑" | "↓" | "→" {
  if (first == null || last == null) return "→";
  const d = last - first;
  if (d > 2) return "↑";
  if (d < -2) return "↓";
  return "→";
}

function last7YmdsInclusive(todayYmd: string): string[] {
  const d = parseYmd(todayYmd);
  if (!d) return [todayYmd];
  const out: string[] = [];
  const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  for (let i = 6; i >= 0; i--) {
    const x = new Date(t0);
    x.setDate(t0.getDate() - i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function debugLog(payload: Record<string, unknown>): void {
  if (typeof process === "undefined") return;
  if (process.env.REACT_APP_RECOVERY_DEBUG !== "1") return;
  try {
    // eslint-disable-next-line no-console
    console.log("[RECOVERY_PIPELINE][fallback7d]", payload);
  } catch {
    // ignore
  }
}

export type RecoveryFallback7dBreakdown = {
  daysUsed: number;
  validDates: string[];
  sleepAvg: number;
  physioAvg: number;
  loadAvg: number;
  sleepTrend: "↑" | "↓" | "→";
  physioTrend: "↑" | "↓" | "→";
  loadTrend: "↑" | "↓" | "→";
  trendValues: number[];
};

export function computeRecoveryFallback7d(args: {
  todayCalendarYmd: string;
  recoveryDailyRows: RecoveryDailyRow[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
}): { score1_100: number; breakdown: RecoveryFallback7dBreakdown } | null {
  const last7 = last7YmdsInclusive(args.todayCalendarYmd);
  const byDate = new Map(args.recoveryDailyRows.map((r) => [r.date, r]));
  const trainingByDay = buildDailyTrainingLoadByDate(args.plan, args.logs);

  const sleepScores: number[] = [];
  const physioScores: number[] = [];
  const loadScores: number[] = [];
  const validDates: string[] = [];

  const sleepSeq: Array<number | null> = [];
  const physioSeq: Array<number | null> = [];
  const loadSeq: Array<number | null> = [];
  const compositeSeq: Array<number | null> = [];

  for (const date of last7) {
    const row = byDate.get(date);
    const inputs: HomeRecoveryInputs = {
      sleepHours: row?.sleepHours ?? null,
      hrvMs: row?.hrvMs ?? null,
      restingHr: row?.restingHr ?? null,
      activeEnergyKcal: row?.activeEnergyKcal ?? null,
    };

    const hasSleep = typeof inputs.sleepHours === "number" && Number.isFinite(inputs.sleepHours);
    const hasHrv = typeof inputs.hrvMs === "number" && Number.isFinite(inputs.hrvMs);
    const hasRhr = typeof inputs.restingHr === "number" && Number.isFinite(inputs.restingHr);
    const validDay = hasSleep && (hasHrv || hasRhr);

    if (!validDay) {
      debugLog({
        stage: "day",
        date,
        validDay: false,
        inputs,
      });
      sleepSeq.push(null);
      physioSeq.push(null);
      loadSeq.push(null);
      compositeSeq.push(null);
      continue;
    }

    const s = scoreSleepHours(inputs.sleepHours as number);
    const p = hasHrv ? scoreHrvMs(inputs.hrvMs as number) : scoreRestingHr(inputs.restingHr as number);

    // Load proxy requirement: activeEnergyKcal OR an "equivalent" from completed sessions.
    // If neither exists for a date, treat it as 0 load (deterministic, not persisted score dependency).
    let l: number;
    if (typeof inputs.activeEnergyKcal === "number" && Number.isFinite(inputs.activeEnergyKcal)) {
      l = loadScoreFromActiveEnergyKcal(inputs.activeEnergyKcal);
    } else {
      const dailyLoad = trainingByDay.get(date) ?? 0;
      l = trainingLoadSubscoreForDay(dailyLoad);
    }

    sleepScores.push(s);
    physioScores.push(p);
    loadScores.push(l);
    validDates.push(date);

    sleepSeq.push(s);
    physioSeq.push(p);
    loadSeq.push(l);
    compositeSeq.push(0.4 * s + 0.4 * p + 0.2 * l);

    debugLog({
      stage: "day",
      date,
      validDay: true,
      inputs,
      subscores: { sleepScore: Math.round(s), physioScore: Math.round(p), loadScore: Math.round(l) },
    });
  }

  // Requirement: at least 3 valid days.
  const daysUsed = sleepScores.length;
  if (daysUsed < 3) {
    debugLog({ stage: "eligibility", eligible: false, reason: "validDays<3", validDays: daysUsed, validDates });
    return null;
  }

  const sleepAvg = mean(sleepScores);
  const physioAvg = mean(physioScores);
  const loadAvg = mean(loadScores);
  if (sleepAvg == null || physioAvg == null || loadAvg == null) {
    debugLog({
      stage: "eligibility",
      eligible: false,
      reason: "missingAverages",
      sleepAvg,
      physioAvg,
      loadAvg,
      validDays: daysUsed,
      validDates,
    });
    return null;
  }

  const score = Math.round(clamp(0.4 * sleepAvg + 0.4 * physioAvg + 0.2 * loadAvg, 1, 100));

  const firstSleep = sleepSeq.find((v) => v != null) ?? null;
  const lastSleep = [...sleepSeq].reverse().find((v) => v != null) ?? null;
  const firstPhys = physioSeq.find((v) => v != null) ?? null;
  const lastPhys = [...physioSeq].reverse().find((v) => v != null) ?? null;
  const firstLoad = loadSeq.find((v) => v != null) ?? null;
  const lastLoad = [...loadSeq].reverse().find((v) => v != null) ?? null;

  const trendValues = compositeSeq.filter((v): v is number => typeof v === "number").map((v) => Math.round(clamp(v, 1, 100)));

  debugLog({
    stage: "result",
    eligible: true,
    validDays: daysUsed,
    validDates,
    avgs: { sleepAvg, physioAvg, loadAvg },
    score1_100: score,
  });

  return {
    score1_100: score,
    breakdown: {
      daysUsed,
      validDates,
      sleepAvg: Math.round(sleepAvg),
      physioAvg: Math.round(physioAvg),
      loadAvg: Math.round(loadAvg),
      sleepTrend: trendArrow(firstSleep, lastSleep),
      physioTrend: trendArrow(firstPhys, lastPhys),
      loadTrend: trendArrow(firstLoad, lastLoad),
      trendValues,
    },
  };
}

