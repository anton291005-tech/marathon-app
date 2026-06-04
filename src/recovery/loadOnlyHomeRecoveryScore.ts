import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";
import { parseYmd, ymd } from "./recoveryCalendarUtils";
import { buildDailyTrainingLoadByDate } from "./trainingDailyLoad";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function activityLoadAdjustmentFromEnergyKcal(activeKcal: number | undefined, baselineKcal: number | null): number {
  if (activeKcal === undefined) return 0;
  if (!Number.isFinite(activeKcal) || activeKcal <= 0) return 0;
  if (baselineKcal === null || baselineKcal <= 0 || !Number.isFinite(baselineKcal)) return 0;
  const rel = clamp((activeKcal - baselineKcal) / baselineKcal, -0.35, 1.1);
  return rel * 6.5;
}

function baselineActiveEnergyKcal(rowsByDate: Map<string, RecoveryDailyRow>, beforeYmd: string, windowDays: number): number[] {
  const end = parseYmd(beforeYmd);
  if (!end) return [];
  const start = new Date(end);
  start.setDate(start.getDate() - windowDays);
  const vals: number[] = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const k = ymd(d);
    const v = rowsByDate.get(k)?.activeEnergyKcal;
    if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
  }
  return vals;
}

/**
 * Load-only home recovery score for a specific day (0–100).
 *
 * Deterministic model (no randomness, no persistence continuation):
 * - Builds daily effective load from completed sessions + relative active-energy deviation (if available)
 * - Uses a chronic vs acute fatigue model (EMA28 vs EMA7) to produce a meaningful daily score
 */
export function computeLoadOnlyHomeRecoveryScore0_100(args: {
  todayYmd: string;
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  recoveryDailyRows: RecoveryDailyRow[];
}): number {
  const d0 = parseYmd(args.todayYmd);
  if (!d0) return 0;

  const rowsByDate = new Map(args.recoveryDailyRows.map((r) => [r.date, r]));
  const trainingByDay = buildDailyTrainingLoadByDate(args.plan, args.logs);

  const windowDays = 28;
  const days: string[] = [];
  const cursor = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
  cursor.setDate(cursor.getDate() - (windowDays - 1));
  for (let i = 0; i < windowDays; i++) {
    days.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Active energy is optional; convert deviation vs personal baseline into load units.
  const baseActiveEnergy = median(baselineActiveEnergyKcal(rowsByDate, args.todayYmd, 28));

  let ema7 = 0;
  let ema28 = 0;
  const a7 = 2 / (7 + 1);
  const a28 = 2 / (28 + 1);

  for (const day of days) {
    const row = rowsByDate.get(day);
    const plannedLoad = trainingByDay.get(day) ?? 0;
    const activityAdj = activityLoadAdjustmentFromEnergyKcal(row?.activeEnergyKcal, baseActiveEnergy);
    const effectiveLoad = Math.max(0, plannedLoad + activityAdj);
    ema7 = a7 * effectiveLoad + (1 - a7) * ema7;
    ema28 = a28 * effectiveLoad + (1 - a28) * ema28;
  }

  const acute = ema7;
  const chronic = ema28;
  const strain = acute - chronic;

  // Translate load history into recovery score; higher acute fatigue and positive strain reduce recovery.
  const score = 92 - acute * 1.35 - strain * 2.1;
  return Math.round(clamp(score, 1, 100));
}

