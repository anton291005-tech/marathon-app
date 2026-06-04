/**
 * Production-safe distance anomaly reporting (no throws) + global metrics
 * for planned-distance resolution, week totals, and parser behavior.
 */

function round1(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.round(km * 10) / 10;
}

const isJest =
  typeof process !== "undefined" && (process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === "test");

/** Verbose per-session logging: on in dev unless REACT_APP_ENABLE_DISTANCE_DEBUG=0; prod only if =1. In Jest, off unless =1. */
export const ENABLE_DISTANCE_DEBUG =
  typeof process !== "undefined" &&
  (isJest
    ? true
    : process.env.REACT_APP_ENABLE_DISTANCE_DEBUG === "1" ||
      (process.env.NODE_ENV !== "production" && process.env.REACT_APP_ENABLE_DISTANCE_DEBUG !== "0"));

export type DistanceIntegrityEvent = {
  tag: "DISTANCE_MISMATCH" | "INVALID_DISTANCE" | "WEEK_KM_MISMATCH" | "PARSER_LOW_CONFIDENCE";
  [key: string]: unknown;
};

function emitStructuredError(event: DistanceIntegrityEvent): void {
  if (!ENABLE_DISTANCE_DEBUG) return;
  // eslint-disable-next-line no-console
  console.warn("[distanceIntegrity]", event);
}

export type AssertDistanceConsistencyInput = {
  structuredDistance: number | null;
  parsedDistance: number | null;
  finalDistance: number;
  sessionId?: string;
  rowKm?: number;
};

export function assertDistanceConsistency(input: AssertDistanceConsistencyInput): void {
  const { structuredDistance, parsedDistance, finalDistance, sessionId, rowKm } = input;
  if (
    structuredDistance != null &&
    parsedDistance != null &&
    structuredDistance > 0 &&
    parsedDistance > 0 &&
    Math.abs(structuredDistance - parsedDistance) > 0.2
  ) {
    emitStructuredError({
      tag: "DISTANCE_MISMATCH",
      code: "STRUCTURED_PARSED_MISMATCH",
      structuredDistance,
      parsedDistance,
      diff: round1(Math.abs(structuredDistance - parsedDistance)),
      finalDistance,
      sessionId,
    });
  }
  if (!Number.isFinite(finalDistance) || finalDistance < 0) {
    emitStructuredError({
      tag: "INVALID_DISTANCE",
      code: "NON_FINITE_OR_NEGATIVE",
      finalDistance,
      sessionId,
    });
  }
  if (finalDistance === 0) {
    const row = typeof rowKm === "number" && Number.isFinite(rowKm) ? rowKm : 0;
    if (row < 0 || (row > 0 && !Number.isFinite(row))) {
      emitStructuredError({
        tag: "INVALID_DISTANCE",
        code: "ZERO_RESOLVED_WITH_BAD_ROW",
        finalDistance: 0,
        rowKm: row,
        sessionId,
      });
    }
  }
}

type SourceBucket = "structured" | "parsed" | "fallback" | "legacy";

const metrics = {
  sessionResolutions: 0,
  structured: 0,
  parsed: 0,
  /** Plan row only (non-legacy) */
  fallback: 0,
  /** Recipe session using raw row after parse distrust */
  legacy: 0,
  mismatchEvents: 0,
  weekMismatchEvents: 0,
  lowConfidenceRejects: 0,
  recentIsFallback: [] as number[],
  recentMax: 200,
};

function pushRecent(isFallback: boolean): void {
  metrics.recentIsFallback.push(isFallback ? 1 : 0);
  if (metrics.recentIsFallback.length > metrics.recentMax) {
    metrics.recentIsFallback.shift();
  }
}

export function recordSessionDistanceResolution(
  source: SourceBucket,
  options?: { wasMismatch?: boolean; lowConfidenceOverride?: boolean },
): void {
  metrics.sessionResolutions += 1;
  if (source === "structured") metrics.structured += 1;
  else if (source === "parsed") metrics.parsed += 1;
  else if (source === "legacy") metrics.legacy += 1;
  else metrics.fallback += 1;
  pushRecent(source === "fallback" || source === "legacy");
  if (options?.wasMismatch) metrics.mismatchEvents += 1;
  if (options?.lowConfidenceOverride) {
    metrics.lowConfidenceRejects += 1;
    emitStructuredError({
      tag: "PARSER_LOW_CONFIDENCE",
      message: "Parsed recipe rejected; using plan row or 0",
    });
  }
}

export function recordWeekKmMismatch(wn: number, sumSessions: number, weekKm: number, diff: number): void {
  metrics.weekMismatchEvents += 1;
  emitStructuredError({
    tag: "WEEK_KM_MISMATCH",
    wn,
    sumSessions,
    weekKm,
    diff: round1(diff),
  });
}

export type DistanceSystemMetrics = {
  sessionResolutions: number;
  pctStructured: number;
  pctParsed: number;
  /** Plan-row fallback (non-legacy) */
  pctFallback: number;
  pctLegacy: number;
  /** fallback + legacy */
  pctFallbackOrLegacy: number;
  mismatchRate: number;
  weekMismatchCount: number;
  lowConfidenceRejects: number;
  recentFallbackRate: number;
};

export function getDistanceSystemMetrics(): DistanceSystemMetrics {
  const n = Math.max(1, metrics.sessionResolutions);
  const r = metrics.recentIsFallback;
  const recentFallbackRate = r.length === 0 ? 0 : r.reduce((a, b) => a + b, 0) / r.length;
  const fb = metrics.fallback + metrics.legacy;
  return {
    sessionResolutions: metrics.sessionResolutions,
    pctStructured: (100 * metrics.structured) / n,
    pctParsed: (100 * metrics.parsed) / n,
    pctFallback: (100 * metrics.fallback) / n,
    pctLegacy: (100 * metrics.legacy) / n,
    pctFallbackOrLegacy: (100 * fb) / n,
    mismatchRate: metrics.mismatchEvents / n,
    weekMismatchCount: metrics.weekMismatchEvents,
    lowConfidenceRejects: metrics.lowConfidenceRejects,
    recentFallbackRate,
  };
}

export function resetDistanceSystemMetricsForTests(): void {
  metrics.sessionResolutions = 0;
  metrics.structured = 0;
  metrics.parsed = 0;
  metrics.fallback = 0;
  metrics.legacy = 0;
  metrics.mismatchEvents = 0;
  metrics.weekMismatchEvents = 0;
  metrics.lowConfidenceRejects = 0;
  metrics.recentIsFallback = [];
}
