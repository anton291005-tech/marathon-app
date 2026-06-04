/**
 * Build set of local dates (YYYY-MM-DD) with at least one completed non-rest session.
 */

import { isSessionLogDone, normalizeCalendarDay, parseSessionDateLabel } from "../appSmartFeatures";
import type { PlanWeek } from "../marathonPrediction";

function formatLocalYmdFromDate(d: Date): string {
  const x = normalizeCalendarDay(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** All trainable types except rest count (running + strength + bike). */
export function buildCompletedTrainingLocalDates(
  plan: PlanWeek[],
  logs: Record<string, { done?: boolean; skipped?: boolean; assignedRun?: { runId?: string } }>,
): Set<string> {
  const set = new Set<string>();
  for (const week of plan) {
    for (const s of week.s) {
      if (s.type === "rest") continue;
      if (!isSessionLogDone(logs[s.id])) continue;
      const pd = parseSessionDateLabel(s.date);
      if (!pd) continue;
      set.add(formatLocalYmdFromDate(pd));
    }
  }
  return set;
}
