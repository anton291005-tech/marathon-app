import type { AiPlanWeek } from "../../lib/ai/types";
import { deepClone } from "../../core/deepClone";

type SessionRef = { session: any };

export function swapWorkouts(plan: AiPlanWeek[], sourceId: string, targetId: string): AiPlanWeek[] {
  const clone: AiPlanWeek[] = deepClone(plan);

  let sourceRef: SessionRef | null = null;
  let targetRef: SessionRef | null = null;

  for (const week of clone) {
    for (const session of week.s) {
      if (session.id === sourceId) sourceRef = { session };
      if (session.id === targetId) targetRef = { session };
    }
  }

  if (!sourceRef || !targetRef) return plan;

  const sourceDay = sourceRef.session.day;
  const sourceDate = sourceRef.session.date;
  sourceRef.session.day = targetRef.session.day;
  sourceRef.session.date = targetRef.session.date;
  targetRef.session.day = sourceDay;
  targetRef.session.date = sourceDate;

  return clone;
}

