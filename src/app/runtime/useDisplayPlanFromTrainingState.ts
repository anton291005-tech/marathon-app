import { useMemo } from "react";
import { deriveDisplayPlan } from "../../displayPlan/deriveDisplayPlan";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import type { TrainingPlanV2 } from "../../planV2/types";

import type { RuntimeDisplayPlan } from "./runtimeDisplayPlanTypes";

/**
 * Read-model bundle: same `deriveDisplayPlan` SSOT as inline `useMemo` in `App.tsx`.
 */
export function useDisplayPlanFromTrainingState(
  trainingPlanV2: TrainingPlanV2,
  aiPlanPatches: unknown,
): RuntimeDisplayPlan {
  return useMemo(() => {
    const normalizedPlan = normalizeTrainingPlan(trainingPlanV2);
    const plan = deriveDisplayPlan(normalizedPlan, aiPlanPatches);
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      Object.freeze(plan);
    }
    return plan;
  }, [trainingPlanV2, aiPlanPatches]);
}
