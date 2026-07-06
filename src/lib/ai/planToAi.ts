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
  const sumSessions = (week.s ?? [])
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
  const sessionType = mapSessionType(typeof session?.type === "string" ? session.type : "easy");
  const safeSession: PlanSession = {
    id: typeof session?.id === "string" && session.id.trim() ? session.id.trim() : `session-${sessionType}`,
    day: typeof session?.day === "string" ? session.day : "",
    date: typeof session?.date === "string" ? session.date : "",
    type: sessionType,
    title:
      typeof session?.title === "string" && session.title.trim()
        ? session.title.trim()
        : sessionType === "rest"
          ? "Ruhetag"
          : "Training",
    km: typeof session?.km === "number" && Number.isFinite(session.km) ? session.km : 0,
    desc: session?.desc ?? null,
    pace: session?.pace ?? null,
    structured: session?.structured ?? null,
  };
  return {
    id: safeSession.id,
    day: safeSession.day,
    date: safeSession.date,
    type: mapSessionType(safeSession.type),
    title: safeSession.title,
    km: getPlannedKmEquiv(safeSession),
    desc: safeSession.desc,
    pace: safeSession.pace,
  };
}

export function normalizePlanWeekToAi(week: PlanWeek): AiPlanWeek {
  const sessions = (Array.isArray(week?.s) ? week.s : []).map(normalizePlanSessionToAi);
  const safeWeek: PlanWeek = {
    wn: typeof week?.wn === "number" && Number.isFinite(week.wn) ? week.wn : 1,
    phase: typeof week?.phase === "string" && week.phase.trim() ? week.phase : "base",
    label: typeof week?.label === "string" ? week.label : "",
    dates: typeof week?.dates === "string" ? week.dates : "",
    km: typeof week?.km === "number" && Number.isFinite(week.km) ? week.km : 0,
    focus: week?.focus,
    s: sessions,
  };
  const km = reconcileWeekPlannedKmForAi(safeWeek);
  return {
    wn: safeWeek.wn,
    phase: safeWeek.phase,
    label: safeWeek.label || `Woche ${safeWeek.wn}`,
    dates: safeWeek.dates ?? "",
    km,
    focus: safeWeek.focus,
    s: sessions,
  };
}

export function toAiPlanWeeks(plan: PlanWeek[]): AiPlanWeek[] {
  return plan.map(normalizePlanWeekToAi);
}
