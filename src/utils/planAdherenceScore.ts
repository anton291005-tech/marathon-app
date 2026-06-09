export type MetricStatus = "green" | "yellow" | "red" | "na";

export type PlanAdherenceInputs = {
  plannedPaceSecPerKm?: { min: number; max: number } | null;
  actualPaceSecPerKm?: number | null;
  plannedDistanceKm?: number | null;
  actualDistanceKm?: number | null;
  plannedHrBpm?: { min: number; max: number } | null;
  actualHrBpm?: number | null;
  /**
   * When set, the overall score’s pace component uses interval segment / interval model results
   * instead of comparing full-session pace to the plan corridor.
   */
  useIntervalPaceMetric?: boolean;
  /** Mean effort-segment pace (s/km); ignored unless `useIntervalPaceMetric`. */
  intervalAvgPaceSecPerKm?: number | null;
  /** Interval model 0–100; when set, used as the pace component accuracy (matches summary ring). */
  intervalIntensityScore0_100?: number | null;
  /** Session type — enables bike-specific scoring path when "bike". */
  sessionType?: string | null;
  /** Actual workout duration in seconds — used for bike time-accuracy scoring. */
  actualDurationSec?: number | null;
  /** Planned workout duration in seconds — used for bike time-accuracy scoring. */
  plannedDurationSec?: number | null;
};

export type PlanAdherenceScoreResult = {
  score: number; // 0..100
  components: {
    paceAccuracy?: number;
    distanceAccuracy?: number;
    hrAccuracy?: number;
  };
  statuses: {
    pace: MetricStatus;
    distance: MetricStatus;
    hr: MetricStatus;
  };
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp100(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Parse any mm:ss occurrences from a label like:
 * - "5:30–5:50/km"
 * - "3:58/km"
 * - "⌀ 4:01/km"
 */
export function parsePlannedPaceRangeSecPerKm(label: string | null | undefined): { min: number; max: number } | null {
  if (!label || typeof label !== "string") return null;
  const re = /(\d{1,2}):(\d{2})/g;
  const secs: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(label)) !== null) {
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) continue;
    const sec = mm * 60 + ss;
    if (sec > 0) secs.push(sec);
  }
  if (!secs.length) return null;
  const min = Math.min(...secs);
  const max = Math.max(...secs);
  return { min, max };
}

function rangeStatus(actual: number | null | undefined, planned: { min: number; max: number } | null | undefined): MetricStatus {
  if (actual == null || planned == null) return "na";
  if (!Number.isFinite(actual) || !Number.isFinite(planned.min) || !Number.isFinite(planned.max)) return "na";
  const lo = Math.min(planned.min, planned.max);
  const hi = Math.max(planned.min, planned.max);
  if (actual >= lo && actual <= hi) return "green";
  const mid = (lo + hi) / 2;
  const tolYellow = Math.max(1, mid * 0.08); // 8% leeway => yellow
  if (Math.abs(actual - (actual < lo ? lo : hi)) <= tolYellow) return "yellow";
  return "red";
}

function ratioStatus(actual: number | null | undefined, planned: number | null | undefined): MetricStatus {
  if (actual == null || planned == null) return "na";
  if (!Number.isFinite(actual) || !Number.isFinite(planned) || planned <= 0) return "na";
  const ratio = actual / planned;
  const diff = Math.abs(1 - ratio);
  if (diff <= 0.05) return "green";
  if (diff <= 0.12) return "yellow";
  return "red";
}

/** Status from |effort pace − target mid| in s/km (interval segments only). */
export function intervalPaceDeviationStatus(deltaSecPerKmRounded: number | null): MetricStatus {
  if (deltaSecPerKmRounded == null || !Number.isFinite(deltaSecPerKmRounded)) return "na";
  const a = Math.abs(deltaSecPerKmRounded);
  if (a <= 10) return "green";
  if (a <= 20) return "yellow";
  return "red";
}

function accuracyFromRange(actual: number, planned: { min: number; max: number }): number {
  const lo = Math.min(planned.min, planned.max);
  const hi = Math.max(planned.min, planned.max);
  if (actual >= lo && actual <= hi) return 100;
  const dist = actual < lo ? (lo - actual) : (actual - hi);
  const mid = (lo + hi) / 2;
  const rel = mid > 0 ? dist / mid : 1;
  // 0% deviation => 100; 25%+ deviation => 0
  return clamp100(100 * (1 - clamp01(rel / 0.25)));
}

function accuracyFromRatio(actual: number, planned: number): number {
  if (planned <= 0) return 0;
  const rel = Math.abs(1 - actual / planned);
  return clamp100(100 * (1 - clamp01(rel / 0.25)));
}

/** HR is a scored component — do not remove without updating weights */
export function scoreHrBpmComponent(
  actualHrBpm: number,
  plannedHrBpm: { min: number; max: number },
): number {
  const lo = Math.min(plannedHrBpm.min, plannedHrBpm.max);
  const hi = Math.max(plannedHrBpm.min, plannedHrBpm.max);
  if (actualHrBpm >= lo && actualHrBpm <= hi) return 100;
  if (actualHrBpm > hi) {
    const over = actualHrBpm - hi;
    if (over <= 5) return 85;
    if (over <= 15) return 65;
    return 40;
  }
  const under = lo - actualHrBpm;
  if (under > 10) return 75;
  return 100;
}

function computeWeightedUmsetzungScore(components: {
  paceAccuracy?: number;
  distanceAccuracy?: number;
  hrAccuracy?: number;
}): number {
  const hasPace = typeof components.paceAccuracy === "number";
  const hasDistance = typeof components.distanceAccuracy === "number";
  const hasHr = typeof components.hrAccuracy === "number";

  if (hasPace && hasDistance && hasHr) {
    return clamp100(
      components.paceAccuracy! * 0.4 + components.distanceAccuracy! * 0.3 + components.hrAccuracy! * 0.3,
    );
  }
  if (hasPace && hasDistance && !hasHr) {
    return clamp100(components.paceAccuracy! * 0.57 + components.distanceAccuracy! * 0.43);
  }
  if (!hasPace && hasDistance && hasHr) {
    return clamp100(components.distanceAccuracy! * 0.5 + components.hrAccuracy! * 0.5);
  }

  const parts: Array<{ weight: number; value: number }> = [];
  if (hasPace) parts.push({ weight: 0.4, value: components.paceAccuracy! });
  if (hasDistance) parts.push({ weight: 0.3, value: components.distanceAccuracy! });
  if (hasHr) parts.push({ weight: 0.3, value: components.hrAccuracy! });
  if (!parts.length) return 0;
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  return clamp100(
    parts.reduce((sum, part) => sum + part.value * (part.weight / totalWeight), 0),
  );
}

/** Interval effort pace vs planned corridor midpoint (s/km delta bands). */
export function scoreIntervalPaceVsPlannedMid(actualSecPerKm: number, plannedMidSecPerKm: number): number {
  if (!Number.isFinite(actualSecPerKm) || !Number.isFinite(plannedMidSecPerKm) || plannedMidSecPerKm <= 0) {
    return 0;
  }
  const delta = actualSecPerKm - plannedMidSecPerKm;
  if (delta <= 0) return 100;
  if (delta <= 5) return 95;
  if (delta <= 10) return 88;
  if (delta <= 20) return 75;
  if (delta <= 30) return 58;
  if (delta <= 45) return 40;
  return Math.max(10, 40 - (delta - 45));
}

/**
 * Umsetzung when interval pace comes from structure estimate (Strategy F) and HR is missing:
 * pace 60%, distance 40%.
 */
export function computeIntervalStructureAdherenceScore(inputs: {
  intervalAvgPaceSecPerKm: number;
  plannedPaceMidSec: number;
  actualDistanceKm: number | null | undefined;
  plannedDistanceKm: number | null | undefined;
}): number {
  const paceScore = scoreIntervalPaceVsPlannedMid(
    inputs.intervalAvgPaceSecPerKm,
    inputs.plannedPaceMidSec,
  );
  const distScore =
    inputs.actualDistanceKm != null &&
    inputs.plannedDistanceKm != null &&
    Number.isFinite(inputs.actualDistanceKm) &&
    Number.isFinite(inputs.plannedDistanceKm) &&
    inputs.plannedDistanceKm > 0
      ? accuracyFromRatio(inputs.actualDistanceKm, inputs.plannedDistanceKm)
      : 50;
  return clamp100(Math.round(paceScore * 0.6 + distScore * 0.4));
}

/** HR accuracy for bike: 100 if in range, degrades linearly outside. */
function computeHrAccuracy(actual: number, min: number, max: number): number {
  if (actual >= min && actual <= max) return 100;
  const center = (min + max) / 2;
  const range = (max - min) / 2 + 10; // etwas Toleranz
  const diff = Math.abs(actual - center);
  return Math.max(0, Math.round(100 - (diff / range) * 100));
}

/** Time accuracy for bike: 100 if 90–115% of plan, degrades outside. */
function computeTimeAccuracy(actualSec: number, plannedSec: number): number {
  if (plannedSec <= 0) return 0;
  const ratio = actualSec / plannedSec;
  if (ratio >= 0.9 && ratio <= 1.15) return 100;
  if (ratio >= 0.75) return Math.round(100 - (0.9 - ratio) * 200);
  return Math.max(0, Math.round(ratio * 80));
}

/** Status based on time ratio vs planned. */
function timeRangeStatus(actualSec: number | null, plannedSec: number | null): MetricStatus {
  if (!actualSec || !plannedSec || plannedSec <= 0) return "na";
  const ratio = actualSec / plannedSec;
  if (ratio >= 0.9 && ratio <= 1.15) return "green";
  if (ratio >= 0.75) return "yellow";
  return "red";
}

export function computePlanAdherenceScore(inputs: PlanAdherenceInputs): PlanAdherenceScoreResult {
  // Bike-spezifischer Score-Pfad: HR 60% + Zeit 40%
  if (inputs.sessionType === "bike") {
    // Fallback A: kein HFmax gesetzt → generische Zone-2-Range (120–150 bpm) verwenden
    const plannedHrMin = inputs.plannedHrBpm?.min ?? 120;
    const plannedHrMax = inputs.plannedHrBpm?.max ?? 150;
    const hasHr = inputs.actualHrBpm != null;
    const hasTime =
      inputs.actualDurationSec != null &&
      inputs.plannedDurationSec != null;

    let bikeScore: number;
    const bikeComponents: PlanAdherenceScoreResult["components"] = {};

    if (hasHr) {
      bikeComponents.hrAccuracy = computeHrAccuracy(inputs.actualHrBpm!, plannedHrMin, plannedHrMax);
    }
    if (hasTime) {
      bikeComponents.paceAccuracy = computeTimeAccuracy(inputs.actualDurationSec!, inputs.plannedDurationSec!);
    }

    if (hasHr && hasTime) {
      bikeScore = Math.round(bikeComponents.hrAccuracy! * 0.6 + bikeComponents.paceAccuracy! * 0.4);
    } else if (hasHr) {
      bikeScore = Math.round(bikeComponents.hrAccuracy!);
    } else if (hasTime) {
      bikeScore = Math.round(bikeComponents.paceAccuracy!);
    } else {
      // Fallback B: keine Vergleichsbasis → neutral statt 0
      bikeScore = 50;
    }

    return {
      score: clamp100(bikeScore),
      components: bikeComponents,
      statuses: {
        pace: timeRangeStatus(inputs.actualDurationSec ?? null, inputs.plannedDurationSec ?? null),
        distance: "na",
        hr: rangeStatus(
          inputs.actualHrBpm ?? null,
          inputs.plannedHrBpm ?? { min: plannedHrMin, max: plannedHrMax },
        ),
      },
    };
  }

  const componentValues: PlanAdherenceScoreResult["components"] = {};

  if (inputs.useIntervalPaceMetric) {
    if (
      typeof inputs.intervalIntensityScore0_100 === "number" &&
      Number.isFinite(inputs.intervalIntensityScore0_100)
    ) {
      componentValues.paceAccuracy = clamp100(inputs.intervalIntensityScore0_100);
    }
  } else if (inputs.actualPaceSecPerKm != null && inputs.plannedPaceSecPerKm != null) {
    componentValues.paceAccuracy = accuracyFromRange(
      inputs.actualPaceSecPerKm,
      inputs.plannedPaceSecPerKm,
    );
  }
  if (inputs.actualDistanceKm != null && inputs.plannedDistanceKm != null) {
    componentValues.distanceAccuracy = accuracyFromRatio(
      inputs.actualDistanceKm,
      inputs.plannedDistanceKm,
    );
  }
  if (inputs.actualHrBpm != null && inputs.plannedHrBpm != null) {
    componentValues.hrAccuracy = scoreHrBpmComponent(inputs.actualHrBpm, inputs.plannedHrBpm);
  }

  const score = computeWeightedUmsetzungScore(componentValues);

  const plannedHrLow =
    inputs.plannedHrBpm != null
      ? Math.min(inputs.plannedHrBpm.min, inputs.plannedHrBpm.max)
      : null;
  const plannedHrHigh =
    inputs.plannedHrBpm != null
      ? Math.max(inputs.plannedHrBpm.min, inputs.plannedHrBpm.max)
      : null;

  // eslint-disable-next-line no-console
  console.log("[SCORE-DIAG] inputs", {
    actualHrBpm: inputs.actualHrBpm ?? null,
    plannedHrLow,
    plannedHrHigh,
    actualPace: inputs.actualPaceSecPerKm ?? null,
    plannedPace: inputs.plannedPaceSecPerKm ?? null,
    actualDistance: inputs.actualDistanceKm ?? null,
    plannedDistance: inputs.plannedDistanceKm ?? null,
    finalScore: score,
    components: componentValues,
  });

  let paceStatus: MetricStatus;
  if (inputs.useIntervalPaceMetric) {
    const planned = inputs.plannedPaceSecPerKm;
    const avg = inputs.intervalAvgPaceSecPerKm;
    if (
      planned != null &&
      avg != null &&
      Number.isFinite(avg) &&
      avg > 0 &&
      Number.isFinite(planned.min) &&
      Number.isFinite(planned.max)
    ) {
      const lo = Math.min(planned.min, planned.max);
      const hi = Math.max(planned.min, planned.max);
      const mid = (lo + hi) / 2;
      paceStatus = intervalPaceDeviationStatus(Math.round(avg - mid));
    } else if (
      typeof inputs.intervalIntensityScore0_100 === "number" &&
      Number.isFinite(inputs.intervalIntensityScore0_100)
    ) {
      const s = inputs.intervalIntensityScore0_100;
      paceStatus = s >= 80 ? "green" : s >= 60 ? "yellow" : "red";
    } else {
      paceStatus = "na";
    }
  } else {
    paceStatus = rangeStatus(inputs.actualPaceSecPerKm ?? null, inputs.plannedPaceSecPerKm ?? null);
  }

  const statuses = {
    pace: paceStatus,
    distance: ratioStatus(inputs.actualDistanceKm ?? null, inputs.plannedDistanceKm ?? null),
    hr: rangeStatus(inputs.actualHrBpm ?? null, inputs.plannedHrBpm ?? null),
  };

  return {
    score,
    components: componentValues,
    statuses,
  };
}

