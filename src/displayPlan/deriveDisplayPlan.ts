import { applyPlanPatches } from "../lib/ai/actions";
import { toAiPlanWeeks } from "../lib/ai/planToAi";
import type { AiPlanWeek } from "../lib/ai/types";
import { normalizeTrainingPlan } from "../planV2/normalizeTrainingPlan";
import { toPlanWeeks } from "../planV2/toPlanWeeks";
import type { TrainingPlanV2 } from "../planV2/types";

/**
 * Single display-time pipeline: V2 → canonical week rows → optional AI patches.
 * Read-only; persistence and mutation stay elsewhere.
 *
 * `patches` accepts `unknown` so callers can forward hydration/state values safely —
 * non-arrays fall back to no patches (same as `undefined`).
 */
export function deriveDisplayPlan(trainingPlanV2: TrainingPlanV2, patches: unknown): AiPlanWeek[] {
  const normalizedPlan = normalizeTrainingPlan(trainingPlanV2);
  const baseWeeks = toPlanWeeks(normalizedPlan);
  const patchList = Array.isArray(patches) ? patches : [];
  const weeks = toAiPlanWeeks(baseWeeks);
  return applyPlanPatches(weeks, patchList);
}
