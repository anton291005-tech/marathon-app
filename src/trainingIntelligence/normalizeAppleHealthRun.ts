/**
 * Strict normalization: StoredHealthRun / plugin shape → NormalizedAppleRun.
 * Local calendar day from workout start (device timezone).
 */

import type { StoredHealthRun } from "../healthRuns";
import type { NormalizedAppleRun } from "./types";

function localYmdFromInstant(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param stored - merged health run from storage
 * @param endTimeMs - optional explicit end (e.g. from native workout.endDate); else start + duration
 */
export function normalizeAppleHealthRun(stored: StoredHealthRun, endTimeMs?: number): NormalizedAppleRun {
  const startMs = new Date(stored.startDate).getTime();
  const durationSec = Number(stored.duration) || 0;
  const endMs =
    typeof endTimeMs === "number" && Number.isFinite(endTimeMs)
      ? endTimeMs
      : startMs + durationSec * 1000;

  const distanceKm = Math.max(0, (stored.distanceMeters || 0) / 1000);
  const durationMin = Math.max(0, durationSec / 60);
  const paceMinPerKm =
    distanceKm > 0.01 && durationMin > 0 ? durationMin / distanceKm : 0;

  const hr =
    typeof stored.avgHeartRateBpm === "number" && Number.isFinite(stored.avgHeartRateBpm)
      ? Math.round(stored.avgHeartRateBpm)
      : null;

  return {
    id: stored.runId,
    date: localYmdFromInstant(startMs),
    startTime: startMs,
    endTime: endMs,
    durationMin,
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    paceMinPerKm: Math.round(paceMinPerKm * 100) / 100,
    avgHeartRate: hr,
    calories: null,
    source: "appleHealth",
    type: "run",
  };
}
