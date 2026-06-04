import type { TrainingPlanV2, WorkoutV2 } from "../../planV2/types";
import type { WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { getWorkoutPhase } from "../../core/getWorkoutPhase";
import { getRecoveryInfluence } from "../../recovery/getRecoveryInfluence";
import type { ValidationContext } from "./validationContext";

function startOfIsoWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const offset = (day + 6) % 7; // Mon->0, Sun->6
  d.setDate(d.getDate() - offset);
  return d;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekStartIsoFor(dateIso: string): string | null {
  const d = new Date(dateIso);
  if (!Number.isFinite(d.getTime())) return null;
  return ymd(startOfIsoWeekMonday(d));
}

function safeNum(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function recoveryStatusFromScore0_100(
  score?: number | null,
): ValidationContext["recoverySummary"]["recoveryStatus"] | undefined {
  const s = typeof score === "number" ? score : null;
  if (s == null || !Number.isFinite(s)) return undefined;
  if (s >= 75) return "fresh";
  if (s >= 45) return "normal";
  return "fatigued";
}

export function buildValidationContext(args: {
  before: TrainingPlanV2;
  after: TrainingPlanV2;
  targetWorkout: WorkoutV2;
  weekPhaseMap?: Map<string, WeekPhaseMeta> | null;
  planGoal?: ValidationContext["planGoal"];
  recoveryScore0_100?: number | null;
  recoveryConfidence?: number;
}): ValidationContext {
  const planGoal: ValidationContext["planGoal"] = args.planGoal ?? "marathon";

  const weekTotals = (args.before.weeks || []).map((w) => safeNum((w as any).totalKm));
  const weeklyAvgLoad = weekTotals.length ? weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length : 0;

  const weekStartIso = weekStartIsoFor(args.targetWorkout.dateIso);
  const afterWeek = weekStartIso
    ? (args.after.weeks || []).find((w) => String((w as any).startIso) === weekStartIso)
    : null;
  const currentWeekLoad = afterWeek ? safeNum((afterWeek as any).totalKm) : 0;

  let phase: ValidationContext["phase"] = "base";
  if (args.weekPhaseMap) {
    const p = getWorkoutPhase(args.targetWorkout, args.weekPhaseMap);
    phase = p;
  }

  const avgRecovery =
    typeof args.recoveryScore0_100 === "number" && Number.isFinite(args.recoveryScore0_100) ? Math.max(0, Math.min(100, args.recoveryScore0_100)) : 50;
  const avgConfidence =
    typeof args.recoveryConfidence === "number" && Number.isFinite(args.recoveryConfidence) ? Math.max(0, Math.min(1, args.recoveryConfidence)) : 0.3;
  const influenceWeight = getRecoveryInfluence(1, avgConfidence); // => 0.3..1.0
  const adjustedRecoveryInfluence = getRecoveryInfluence(avgRecovery, avgConfidence);
  const recoveryStatus = recoveryStatusFromScore0_100(avgRecovery) ?? "normal";

  return {
    planGoal,
    currentWeekLoad,
    weeklyAvgLoad,
    recoverySummary: {
      avgRecovery,
      avgConfidence,
      influenceWeight,
      adjustedRecoveryInfluence,
      recoveryStatus,
    },
    phase,
  };
}

