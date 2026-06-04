import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { AiPlanWeek } from "../../lib/ai/types";

export function validatePlanIntegrity(plan: AiPlanWeek[]): boolean {
  if (!Array.isArray(plan)) return false;
  const ids = new Set<string>();

  for (const week of plan) {
    if (!week || !Array.isArray(week.s)) return false;
    for (const session of week.s) {
      if (!session || typeof session.id !== "string" || !session.id.trim()) return false;
      if (ids.has(session.id)) return false;
      ids.add(session.id);

      if (typeof session.day !== "string" || !session.day.trim()) return false;
      if (typeof session.date !== "string" || !session.date.trim()) return false;
      if (!parseSessionDateLabel(session.date)) return false;
    }
  }

  return true;
}

