/**
 * Defensive km sanitization for analytics (recovery, load, coach, AI).
 * Clamps, rejects NaN, and dampens pathological spikes vs. weekly context.
 */

const DEFAULT_ROLLING = 8;

const rollingStore = { lastValid: DEFAULT_ROLLING };

function clamp0to200(v: number): number {
  if (!Number.isFinite(v)) return rollingStore.lastValid;
  return Math.min(200, Math.max(0, v));
}

export type SanitizeDistanceOptions = {
  /** When set, values above 2× this average are treated as invalid (use rolling fallback) */
  weeklyAvgKm?: number;
  /** Per-call last valid (e.g. from recent planned km) */
  rollingRef?: { value: number };
};

/**
 * Sanitize a km value for downstream scoring: clamp to [0, 200], reject NaN/negative,
 * and replace unrealistic spikes (>2× weekly average) with last valid rolling value.
 */
export function sanitizeDistance(km: number, options?: SanitizeDistanceOptions): number {
  if (!Number.isFinite(km) || km < 0) {
    return options?.rollingRef ? options.rollingRef.value : rollingStore.lastValid;
  }
  let v = clamp0to200(km);
  const avg = options?.weeklyAvgKm;
  if (typeof avg === "number" && Number.isFinite(avg) && avg > 0 && v > 2 * avg) {
    const fb = options?.rollingRef ? options.rollingRef.value : rollingStore.lastValid;
    return clamp0to200(fb);
  }
  if (v > 0) {
    rollingStore.lastValid = v;
    if (options?.rollingRef) options.rollingRef.value = v;
  }
  return v;
}

export function getDefaultRollingDistanceKm(): number {
  return rollingStore.lastValid;
}

export function resetSanitizeDistanceStateForTests(): void {
  rollingStore.lastValid = DEFAULT_ROLLING;
}
