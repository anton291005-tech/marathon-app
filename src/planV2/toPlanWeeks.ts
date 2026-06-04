import type { PlanSession, PlanWeek } from "../marathonPrediction";
import type { TrainingPlanV2, WorkoutV2, WeekV2 } from "./types";

const DE_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function formatDateLabelDe(date: Date): string {
  return `${date.getDate()}. ${DE_MONTHS[date.getMonth()]}`;
}

function toPlanSession(workout: WorkoutV2): PlanSession | null {
  const d = new Date(workout.dateIso);
  if (!Number.isFinite(d.getTime())) return null;
  const day = DE_WEEKDAYS[d.getDay()];
  const date = formatDateLabelDe(d);
  return {
    id: workout.id,
    day,
    date,
    type: workout.sessionType,
    title: workout.title,
    km: typeof workout.km === "number" && Number.isFinite(workout.km) ? workout.km : 0,
    desc: workout.desc ?? null,
    pace: workout.pace ?? null,
    structured: workout.structured ?? null,
  };
}

function attachMetaFallback(
  week: WeekV2,
  idx: number,
): { wn: number; phase: string; label: string; dates: string; focus?: string } {
  const base = week.meta ?? {};
  return {
    wn: typeof base.wn === "number" ? base.wn : idx + 1,
    phase: typeof base.phase === "string" && base.phase ? base.phase : "BASE",
    label: typeof base.label === "string" && base.label ? base.label : `Woche ${idx + 1}`,
    dates: typeof base.dates === "string" ? base.dates : "",
    ...(typeof base.focus === "string" && base.focus ? { focus: base.focus } : {}),
  };
}

export function toPlanWeeks(plan: TrainingPlanV2): PlanWeek[] {
  const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
  return weeks.map((week, idx) => {
    const meta = attachMetaFallback(week, idx);
    const sessions = week.workouts.map(toPlanSession).filter((s): s is PlanSession => !!s);
    return {
      wn: meta.wn,
      phase: meta.phase,
      label: meta.label,
      dates: meta.dates,
      km: week.totalKm,
      focus: meta.focus,
      s: sessions,
    };
  });
}

