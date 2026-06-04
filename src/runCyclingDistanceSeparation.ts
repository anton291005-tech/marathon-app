import { getStoredHealthRunCanonicalType, type StoredHealthRun } from "./healthRuns";

/**
 * Konsolen-Check: kanonische Typen + Distanz pro Health-Row (iOS-Debug, nicht in Jest-Spam).
 */
export function logWorkoutSanityCheckDev(workouts: StoredHealthRun[], label = "[WORKOUT SANITY CHECK]"): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const rows = workouts.map((w) => ({
    type: getStoredHealthRunCanonicalType(w),
    distanceMeters: w.distanceMeters ?? null,
    distanceUnknown: !!w.distanceUnknown,
  }));
  // eslint-disable-next-line no-console
  console.log(
    label,
    rows,
  );
}

/**
 * Apple-Health-Summe im Fenster: nur sinnvolle Distanz (keine unknown-Rows).
 * runKm/bikeKm aus kanonischem Typ; totalKm = runKm + bikeKm.
 */
export function sumRunBikeTotalKmFromHealthInRange(
  workouts: StoredHealthRun[],
  startMs: number,
  endMs: number,
): { runKm: number; bikeKm: number; totalKm: number } {
  let runM = 0;
  let bikeM = 0;
  for (const w of workouts) {
    const t = new Date(w.startDate).getTime();
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
    if (w.distanceUnknown || w.distanceMeters == null || !Number.isFinite(w.distanceMeters) || w.distanceMeters <= 0) {
      continue;
    }
    const c = getStoredHealthRunCanonicalType(w);
    if (c === "run") runM += w.distanceMeters;
    else if (c === "bike") bikeM += w.distanceMeters;
  }
  const runKm = runM / 1000;
  const bikeKm = bikeM / 1000;
  const totalKm = runKm + bikeKm;
  if (process.env?.NODE_ENV !== "test" && Math.abs(totalKm - (runKm + bikeKm)) > 1e-6) {
    throw new Error("❌ totalKm != runKm + bikeKm — invariant broken");
  }
  return { runKm, bikeKm, totalKm };
}

export function logRunBikeTotalFromHealthDev(
  workouts: StoredHealthRun[],
  startMs: number,
  endMs: number,
): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const { runKm, bikeKm, totalKm } = sumRunBikeTotalKmFromHealthInRange(workouts, startMs, endMs);
  // eslint-disable-next-line no-console
  console.log({ runKm, bikeKm, totalKm });
}
