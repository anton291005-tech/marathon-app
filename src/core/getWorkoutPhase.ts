import type { WorkoutV2 } from "../planV2/types";
import type { TrainingPhase } from "../planV2/trainingPhase";

function startOfIsoWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const offset = (day + 6) % 7; // Mon->0, Sun->6
  d.setDate(d.getDate() - offset);
  return d;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type WeekPhaseMeta = {
  weekStartIso: string;
  phase: TrainingPhase;
};

export function getWorkoutPhase(workout: WorkoutV2, weekPhaseMap: Map<string, WeekPhaseMeta>): TrainingPhase {
  const d = new Date(workout.dateIso);
  if (!Number.isFinite(d.getTime())) return "base";
  const key = ymd(startOfIsoWeekMonday(d));
  return weekPhaseMap.get(key)?.phase ?? "base";
}

