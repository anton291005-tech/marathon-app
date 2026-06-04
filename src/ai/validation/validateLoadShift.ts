import type { TrainingPlanV2 } from "../../planV2/types";
import { allow, axis, warn, type ValidationResult } from "./validationResult";

export type LoadShiftWarning = {
  weekStartIso: string;
  beforeKm: number;
  afterKm: number;
  ratio: number;
};

function safeNum(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeLoadShiftWarnings(before: TrainingPlanV2, after: TrainingPlanV2, maxIncreaseRatio = 0.3): LoadShiftWarning[] {
  const beforeByWeek = new Map(before.weeks.map((w) => [w.startIso, safeNum(w.totalKm)] as const));
  const afterByWeek = new Map(after.weeks.map((w) => [w.startIso, safeNum(w.totalKm)] as const));
  // Avoid iterator spread (ts downlevelIteration) for CRA builds.
  const allWeeks = new Set<string>([
    ...Array.from(beforeByWeek.keys()),
    ...Array.from(afterByWeek.keys()),
  ]);

  const warnings: LoadShiftWarning[] = [];
  const allWeeksArr = Array.from(allWeeks);
  for (let i = 0; i < allWeeksArr.length; i += 1) {
    const weekStartIso = allWeeksArr[i];
    const b = beforeByWeek.get(weekStartIso) ?? 0;
    const a = afterByWeek.get(weekStartIso) ?? 0;
    if (b <= 0) continue;
    const ratio = (a - b) / b;
    if (ratio > maxIncreaseRatio) {
      warnings.push({ weekStartIso, beforeKm: b, afterKm: a, ratio });
    }
  }
  return warnings.sort((x, y) => y.ratio - x.ratio);
}

export function validateLoadShift(before: TrainingPlanV2, after: TrainingPlanV2, maxIncreaseRatio = 0.3): ValidationResult {
  const warnings = computeLoadShiftWarnings(before, after, maxIncreaseRatio);
  if (!warnings.length) return allow();
  const top = warnings[0];
  const ratioOver = Math.max(0, top.ratio - maxIncreaseRatio);
  // Deterministic mapping: just above threshold => ~50, large increase => up to ~90.
  const score = Math.max(50, Math.min(90, 50 + (ratioOver / Math.max(0.0001, maxIncreaseRatio)) * 40));
  const reason = `Achtung: Wochenbelastung steigt deutlich (${Math.round(top.beforeKm)} → ${Math.round(top.afterKm)} km).`;
  const axes = { load: axis(score, reason) };
  return score >= 60 ? warn(axes) : allow(axes);
}

