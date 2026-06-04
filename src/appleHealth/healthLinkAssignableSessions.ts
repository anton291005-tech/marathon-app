/**
 * Apple Health → Plan assignment targets: activity-aware session lists (not run-only).
 */

import type { PlanSession } from "../marathonPrediction";

/** Plan session types that represent running workouts (linkable with a run from Health). */
export const HEALTH_LINK_RUN_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);

/** Pool: running plan rows + Rennrad plan rows (no Rest/Kraft). */
export function buildHealthLinkableSessionPool(sessions: PlanSession[]): PlanSession[] {
  return sessions.filter(
    (session) => HEALTH_LINK_RUN_TYPES.has(session.type) || session.type === "bike",
  );
}

export type AssignableHealthLinkMeta = {
  assignable: PlanSession[];
  /** True when the primary filter returned no rows and the full pool was returned instead. */
  usedFallback: boolean;
  /** Session types from the pre-fallback filter (empty if fallback). */
  filteredTypes: string[];
};

/**
 * Subset of `pool` appropriate for the selected Health workout canonical type.
 * If the filtered list is empty, returns full `pool` so the UI never goes blank.
 */
export function getAssignableHealthLinkPlanSessionsWithMeta(
  selectedCanonical: "run" | "bike" | "other",
  pool: PlanSession[],
): AssignableHealthLinkMeta {
  let filtered: PlanSession[];
  if (selectedCanonical === "run") {
    filtered = pool.filter((s) => HEALTH_LINK_RUN_TYPES.has(s.type));
  } else if (selectedCanonical === "bike") {
    filtered = pool.filter((s) => s.type === "bike" || s.type === "cross");
  } else {
    filtered = [...pool];
  }
  const usedFallback = filtered.length === 0;
  const assignable = usedFallback ? [...pool] : filtered;
  return {
    assignable,
    usedFallback,
    filteredTypes: usedFallback ? [] : filtered.map((s) => s.type),
  };
}

export function getAssignableHealthLinkPlanSessions(
  selectedCanonical: "run" | "bike" | "other",
  pool: PlanSession[],
): PlanSession[] {
  return getAssignableHealthLinkPlanSessionsWithMeta(selectedCanonical, pool).assignable;
}

/** Coarse DE label for assignment list (Lauf vs Rennrad). */
export function healthLinkAssignmentBucketLabelDe(sessionType: string): string {
  if (sessionType === "bike") return "Rennrad";
  if (HEALTH_LINK_RUN_TYPES.has(sessionType)) return "Lauf";
  if (sessionType === "cross") return "Cross";
  return "Einheit";
}
