/**
 * Generic Apple Health workout selection for "Training wählen" — NOT from plan sessions or run-only candidates.
 */

import type { StoredHealthRun } from "../healthRuns";
import {
  getStoredHealthRunCanonicalType,
  storedHealthRunDistanceKmNumeric,
} from "../healthRuns";
import type { CanonicalWorkoutType } from "./workoutTypeClassifier";

/** UI + assignment: canonical synced workout (matches StoredHealthRun, explicit fields). */
export type Workout = {
  id: string;
  type: CanonicalWorkoutType;
  startDate: string;
  durationSec: number;
  distanceMeters: number | null;
};

/** Persisted link: session log slice (runId doubles as workoutId for HealthKit identity). */
export type WorkoutAssignment = {
  workoutId: string;
  canonicalActivityType: "run" | "bike" | "other";
};

/**
 * Selection list = `healthRuns` only, newest first. No plan filter, no type filter.
 */
export function buildSelectionOptionsFromHealthRuns(
  healthRuns: StoredHealthRun[] | null | undefined,
): StoredHealthRun[] {
  return [...(healthRuns || [])]
    .filter((r) => r && r.runId)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

export function storedHealthRunToWorkout(
  r: StoredHealthRun,
  opts?: { skipDevLog?: boolean },
): Workout {
  const canonical = getStoredHealthRunCanonicalType(r);
  const mapped: Workout = {
    id: r.runId,
    type: canonical,
    startDate: r.startDate,
    durationSec: typeof r.duration === "number" && Number.isFinite(r.duration) ? r.duration : 0,
    distanceMeters: r.distanceUnknown ? null : r.distanceMeters,
  };
  if (process.env.NODE_ENV === "development") {
    if (!opts?.skipDevLog) {
      // eslint-disable-next-line no-console
      console.log("[MAPPING INPUT]", {
        originalType: r.workoutType,
        canonical,
      });
    }
    if (canonical === "bike" && mapped.type !== "bike") {
      throw new Error("❌ MAPPING DESTROYS BIKE TYPE");
    }
  }
  return mapped;
}

/** UI label from canonical type only (single source: `getStoredHealthRunCanonicalType`). */
export function workoutLabelDeFromCanonical(type: CanonicalWorkoutType): string {
  if (type === "run") return "Lauf";
  if (type === "bike") return "Rennrad";
  return "Aktivität";
}

export function workoutLabelDe(w: Workout | Pick<Workout, "type">): string {
  return workoutLabelDeFromCanonical(w.type);
}

export function formatWorkoutSelectionDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Payload for `SessionLog.assignedRun` when user assigns a Health workout to a plan row.
 */
export function buildAssignedRunFromWorkout(workout: StoredHealthRun): {
  runId: string;
  workoutId: string;
  startDate: string;
  duration: number;
  distanceKm: number;
  canonicalActivityType: CanonicalWorkoutType;
  avgHeartRateBpm?: number;
} {
  const km = storedHealthRunDistanceKmNumeric(workout) ?? 0;
  const canonicalActivityType = getStoredHealthRunCanonicalType(workout);
  return {
    runId: workout.runId,
    workoutId: workout.runId,
    startDate: workout.startDate,
    duration: workout.duration,
    distanceKm: Math.round(km * 100) / 100,
    canonicalActivityType,
    ...(typeof workout.avgHeartRateBpm === "number" &&
    Number.isFinite(workout.avgHeartRateBpm)
      ? { avgHeartRateBpm: workout.avgHeartRateBpm }
      : {}),
  };
}

export function selectionOptionsIncludeSameBikesAsStore(
  healthRuns: StoredHealthRun[],
  selectionOptions: StoredHealthRun[],
): boolean {
  const storeHasBike = healthRuns.some((w) => getStoredHealthRunCanonicalType(w) === "bike");
  const listHasBike = selectionOptions.some((w) => getStoredHealthRunCanonicalType(w) === "bike");
  if (!storeHasBike) return true;
  return listHasBike;
}

export function assertCyclingInSelectionOrThrow(
  healthRuns: StoredHealthRun[],
  selectionOptions: StoredHealthRun[],
): void {
  if (!selectionOptionsIncludeSameBikesAsStore(healthRuns, selectionOptions)) {
    throw new Error("❌ CYCLING NOT IN SELECTION — SYSTEM BROKEN");
  }
}
