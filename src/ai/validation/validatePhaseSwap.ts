import type { WorkoutV2 } from "../../planV2/types";
import type { TrainingPhase } from "../../planV2/trainingPhase";
import { getWorkoutPhase, type WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { allow, axis, warn, type ValidationResult } from "./validationResult";
import { isHardWorkout } from "./hardWorkout";
import type { ValidationContext } from "./validationContext";

export type PhaseSwapMeta = {
  sourcePhase: TrainingPhase;
  targetPhase: TrainingPhase;
};

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
 * - warn: hard sessions into taper (suboptimal, but user can override; „hart“ = `isHardSession` des Kerns, I13)
 *
 * Entfallen (docs/plan-spec.md §15.5 (3)): „Long Run in die Basis“ und „Peak-Kompression“.
 */
export function validatePhaseSwap(
  source: WorkoutV2,
  target: WorkoutV2,
  context: { weekPhaseMap: Map<string, WeekPhaseMeta>; validationContext: ValidationContext; easyPaceSecPerKm?: number },
): ValidationResult {
  const easyPace = context.easyPaceSecPerKm;
  const { targetPhase } = getSwapPhaseMeta(source, target, context);
  const v = context.validationContext;
  const rs = v.recoverySummary;
  const fatiguePressure = (50 - rs.avgRecovery) / 25; // continuous; fatigued => positive, fresh => negative

  // RULE 1: High-intensity into taper is suboptimal (warn only)
  if (targetPhase === "taper" && isHardWorkout(source, easyPace)) {
    // decisionScore = basePlanLoad + fatiguePressure * adjustedRecoveryInfluence + microStructurePenalty
    const basePlanLoad = 70;
    const microStructurePenalty = 0;
    const decisionScore = basePlanLoad + fatiguePressure * rs.adjustedRecoveryInfluence + microStructurePenalty;
    const score = Math.max(0, Math.min(100, Math.round(decisionScore)));
    const axes = { structural: axis(score, "Intensive Einheit in Taper ist suboptimal") };
    return score >= 60 ? warn(axes) : allow(axes);
  }

  return allow();
}

