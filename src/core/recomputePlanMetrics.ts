import type { AiPlanWeek } from "../lib/ai/types";
import { deepClone } from "./deepClone";

export function recomputePlanMetrics(plan: AiPlanWeek[]): AiPlanWeek[] {
  const clone: AiPlanWeek[] = deepClone(plan);
  for (const week of clone) {
    let totalKm = 0;
    for (const session of week.s ?? []) {
      if (session.type === "rest") continue;
      const km = typeof session.km === "number" && Number.isFinite(session.km) ? session.km : 0;
      totalKm += km;
    }
    week.km = totalKm;
  }
  return clone;
}

