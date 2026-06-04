import { deepClone } from "../../core/deepClone";
import type { TrainingPlanV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";

export function swapWorkoutDates(plan: TrainingPlanV2, aId: string, bId: string): TrainingPlanV2 {
  const clone = deepClone(plan);
  const a = clone.workouts.find((w) => w.id === aId);
  const b = clone.workouts.find((w) => w.id === bId);
  if (!a || !b) return plan;
  if (aId === bId) return plan;

  const tempDate = a.dateIso;
  a.dateIso = b.dateIso;
  b.dateIso = tempDate;

  // Structural truth is workouts => always rebuild derived weeks.
  const metaByWeekStart = new Map(clone.weeks.map((w) => [w.startIso, w.meta] as const));
  return rebuildPlanFromWorkouts({ workouts: clone.workouts, metaByWeekStart });
}

