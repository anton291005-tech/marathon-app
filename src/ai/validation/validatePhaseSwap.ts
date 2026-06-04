import type { WorkoutV2 } from "../../planV2/types";
import type { TrainingPhase } from "../../planV2/trainingPhase";
import { getWorkoutPhase, type WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { allow, axis, warn, type ValidationResult } from "./validationResult";
import { inferIntensity } from "./validateMicroStructure";
import type { ValidationContext } from "./validationContext";

export type PhaseSwapMeta = {
  sourcePhase: TrainingPhase;
  targetPhase: TrainingPhase;
};

function isHighIntensity(workout: WorkoutV2): boolean {
  return inferIntensity(workout) === "high";
}

function isLongRun(workout: WorkoutV2): boolean {
  return workout.sessionType === "long";
}

export function getSwapPhaseMeta(
  source: WorkoutV2,
  target: WorkoutV2,
  context: { weekPhaseMap: Map<string, WeekPhaseMeta> },
): PhaseSwapMeta {
  const sourcePhase = getWorkoutPhase(source, context.weekPhaseMap);
  const targetPhase = getWorkoutPhase(target, context.weekPhaseMap);
  return { sourcePhase, targetPhase };
}

/**
 * Deterministic phase-aware constraints for swaps.
 *
 * Strict rules:
 * - warn: hard sessions into taper (suboptimal, but user can override)
 * - warn: long runs into base (periodization)
 * - warn: peak -> peak stacking risk
 */
export function validatePhaseSwap(
  source: WorkoutV2,
  target: WorkoutV2,
  context: { weekPhaseMap: Map<string, WeekPhaseMeta>; validationContext: ValidationContext },
): ValidationResult {
  const { sourcePhase, targetPhase } = getSwapPhaseMeta(source, target, context);
  const v = context.validationContext;
  const rs = v.recoverySummary;
  const fatiguePressure = (50 - rs.avgRecovery) / 25; // continuous; fatigued => positive, fresh => negative

  // RULE 1: High-intensity into taper is suboptimal (warn only)
  if (targetPhase === "taper" && isHighIntensity(source)) {
    // decisionScore = basePlanLoad + fatiguePressure * adjustedRecoveryInfluence + microStructurePenalty
    const basePlanLoad = 70;
    const microStructurePenalty = 0;
    const decisionScore = basePlanLoad + fatiguePressure * rs.adjustedRecoveryInfluence + microStructurePenalty;
    const score = Math.max(0, Math.min(100, Math.round(decisionScore)));
    const axes = { structural: axis(score, "Intensive Einheit in Taper ist suboptimal") };
    return score >= 60 ? warn(axes) : allow(axes);
  }

  // RULE 2: Long runs into base phase is usually suboptimal periodization (warn only)
  if (isLongRun(source) && targetPhase === "base") {
    const score = v.planGoal === "base" ? 35 : 55;
    const axes = { structural: axis(score, "Phase mismatch: Long Run gehört typischerweise nicht in die Base-Phase.") };
    return score >= 60 ? warn(axes) : allow(axes);
  }

  // RULE 3: Peak compression warning (user override)
  if (sourcePhase === "peak" && targetPhase === "peak") {
    const basePlanLoad = 70;
    const microStructurePenalty = 0;
    const decisionScore = basePlanLoad + fatiguePressure * rs.adjustedRecoveryInfluence + microStructurePenalty;
    const score = Math.max(0, Math.min(100, Math.round(decisionScore)));
    const axes = { structural: axis(score, "Phase/Struktur: Peak-Kompression kann die Belastung zu stark bündeln.") };
    return score >= 60 ? warn(axes) : allow(axes);
  }

  return allow();
}

