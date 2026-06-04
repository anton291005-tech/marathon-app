import type { AiPlanWeek } from "../../lib/ai/types";
import { recomputePlanMetrics } from "../../core/recomputePlanMetrics";
import { deepClone } from "../../core/deepClone";
import { validatePlanIntegrity } from "../validation/validatePlanIntegrity";
import { swapWorkouts } from "./swapWorkouts";

export function safeSwapWorkouts(plan: AiPlanWeek[], sourceId: string, targetId: string): AiPlanWeek[] {
  const before: AiPlanWeek[] = deepClone(plan);
  if (!sourceId || !targetId) return before;
  if (sourceId === targetId) return before;

  const updated = recomputePlanMetrics(swapWorkouts(plan, sourceId, targetId));
  const isValid = validatePlanIntegrity(updated);

  if (!isValid) {
    // eslint-disable-next-line no-console
    console.warn("Swap rejected: integrity violation");
    return before;
  }

  return updated;
}

