import { getPlannedKmEquiv, type PlanSession, type PlanWeek } from "../../marathonPrediction";
import type { AiPlanSession, AiPlanWeek } from "./types";
import { mapSessionType } from "./mapSessionType";
import { getWeekPlannedKmForDisplay, weekPlannedRunningKm } from "../../weeklyAnalysis";

function countsTowardWeeklyRunKm(s: PlanSession): boolean {
  if (s.type === "rest") return false;
  return s.type !== "strength" && s.type !== "bike";
}

/**
 * Invariant: `week.km` == sum of per-session `km` using the same `getPlannedKmEquiv` as `weekPlannedRunningKm`.
 * Never use static `week.km` from the plan row (avoids legacy drift).
 */
export function reconcileWeekPlannedKmForAi(week: PlanWeek): number {
  const sumSessions = week.s
    .filter(countsTowardWeeklyRunKm)
    .reduce((a, s) => a + getPlannedKmEquiv(s), 0);
  const rounded = weekPlannedRunningKm(week);
  const out = getWeekPlannedKmForDisplay(week);
  if (Math.abs(sumSessions - out) > 0.1) {
    // eslint-disable-next-line no-console
    console.warn("[planToAi] week km != sum of planned equiv", { wn: week.wn, sumSessions, out, rounded });
  }
  return out;
}

/** Normalize a plan session from the data layer so `type` is always SessionType. */
export function normalizePlanSessionToAi(session: PlanSession): AiPlanSession {
  return {
    id: session.id,
    day: session.day,
    date: session.date,
    type: mapSessionType(session.type),
    title: session.title,
    km: getPlannedKmEquiv(session),
    desc: session.desc,
    pace: session.pace,
  };
}

export function normalizePlanWeekToAi(week: PlanWeek): AiPlanWeek {
  const sessions = week.s.map(normalizePlanSessionToAi);
  const km = reconcileWeekPlannedKmForAi(week);
  return {
    wn: week.wn,
    phase: week.phase,
    label: week.label ?? "",
    dates: week.dates ?? "",
    km,
    focus: week.focus,
    s: sessions,
  };
}

export function toAiPlanWeeks(plan: PlanWeek[]): AiPlanWeek[] {
  return plan.map(normalizePlanWeekToAi);
}
