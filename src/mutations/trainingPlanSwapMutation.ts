import { swapWorkoutDates } from "../ai/mutations/swapWorkoutDates";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import type { TrainingPlanV2 } from "../planV2/types";

export type SwapPlanV2Result =
  | { ok: true; after: TrainingPlanV2 }
  | { ok: false; reason: "noop" | "missing_ids" | "integrity_failed" | "swap_noop" };

/**
 * Pure swap boundary: clone + date swap + structural integrity only.
 * Load/recovery validation stays in UI layer (`validateSwap`, etc.).
 */
export function trySwapWorkoutDatesInPlan(
  before: TrainingPlanV2,
  sourceId: string,
  targetId: string,
): SwapPlanV2Result {
  const s = typeof sourceId === "string" ? sourceId.trim() : "";
  const t = typeof targetId === "string" ? targetId.trim() : "";
  if (!s || !t || s === t) return { ok: false, reason: "noop" };

  const hasA = before?.workouts?.some((w) => w.id === s);
  const hasB = before?.workouts?.some((w) => w.id === t);
  if (!hasA || !hasB) return { ok: false, reason: "missing_ids" };

  const after = swapWorkoutDates(before, s, t);
  if (after === before) return { ok: false, reason: "swap_noop" };
  if (!validateTrainingPlanV2Integrity(after)) return { ok: false, reason: "integrity_failed" };

  return { ok: true, after };
}
