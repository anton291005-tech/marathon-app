import type { PlanSession, PlanWeek } from "../marathonPrediction";
import { parseSessionDateLabel } from "../appSmartFeatures";
import { rebuildPlanFromWorkouts } from "../core/deriveWeeksFromWorkouts";
import { normalizeTrainingPlan } from "../planV2/normalizeTrainingPlan";
import type { TrainingPlanV2, WeekV2, WorkoutV2 } from "./types";
import { normalizeTrainingPhase } from "./trainingPhase";

function sessionTypeToSport(type: string): WorkoutV2["sport"] {
  if (type === "bike") return "bike";
  if (type === "rest") return "rest";
  return "run";
}

function weekStartIsoFromWeek(week: PlanWeek): string | null {
  if (!week.s || !Array.isArray(week.s)) return null;
  // Use first parseable session date in this week to compute Monday start.
  const dates = week.s
    .map((s) => parseSessionDateLabel(s.date))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return null;
  const d = new Date(dates[0]);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const offset = (day + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function buildWeekMetaMapFromBasePlan(base: PlanWeek[]): Map<string, WeekV2["meta"]> {
  const map = new Map<string, WeekV2["meta"]>();
  for (const week of base) {
    const startIso = weekStartIsoFromWeek(week);
    if (!startIso) continue;
    map.set(startIso, {
      wn: week.wn,
      phase: normalizeTrainingPhase(week.phase),
      label: week.label ?? "",
      dates: week.dates ?? "",
      focus: week.focus,
    });
  }
  return map;
}

function toWorkout(session: PlanSession): WorkoutV2 | null {
  const d = parseSessionDateLabel(session.date);
  if (!d) return null;
  const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
  return {
    id: session.id,
    dateIso: iso,
    sport: sessionTypeToSport(session.type),
    sessionType: session.type,
    title: session.title,
    km: typeof session.km === "number" && Number.isFinite(session.km) ? session.km : 0,
    desc: session.desc ?? null,
    pace: session.pace ?? null,
    structured: session.structured ?? null,
  };
}

export function buildTrainingPlanV2FromBasePlan(base: PlanWeek[]): TrainingPlanV2 {
  const metaByWeekStart = buildWeekMetaMapFromBasePlan(base);
  const workouts: WorkoutV2[] = base
    .flatMap((w) => (Array.isArray(w.s) ? w.s : []))
    .map(toWorkout)
    .filter((w): w is WorkoutV2 => !!w);
  return normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts, metaByWeekStart }));
}

