import type { StructuredWorkoutSpec } from "../../sessionDistance";
import type { IntervalMeta, IntervalSegment } from "./types";

// ---------------------------------------------------------------------------
// Public input types
// ---------------------------------------------------------------------------

export type WorkoutLap = {
  distanceMeters?: number;
  durationSeconds: number;
  /** Pre-computed pace (sec/km). If absent, derived from distanceMeters + durationSeconds. */
  avgPaceSecPerKm?: number;
  /** HK / device lap window (Strategy A). */
  startDate?: Date | number | string;
  endDate?: Date | number | string;
};

export type GpsPacePoint = {
  timeOffsetSeconds: number;
  paceSecPerKm: number;
};

/** Auto-lap / split rows (Strategy B): distance + duration, no lap timestamps. */
export type SplitEntry = {
  distanceMeters: number;
  durationSeconds?: number;
  elapsedTimeSeconds?: number;
  avgPaceSecPerKm?: number;
};

export type IntervalPlanInfo = {
  repCount?: number;
  /** Metres */
  repDistance?: number;
  repUnit?: "m" | "km" | "min";
  targetPaceSecPerKm?: number;
};

export type IntervalPlanOverrides = {
  repCount?: number;
  repDistanceM?: number;
};

export type ExtractionResult = {
  effortSegments: IntervalSegment[];
  extractionStrategy: "laps" | "splits" | "gps_stream" | "structure_estimated" | "none";
};

/** Strategy F: total time + parsed plan structure when laps/splits/GPS are absent. */
export type StructureEstimateInput = {
  totalDurationSec?: number | null;
  totalDistanceMeters?: number | null;
  structuredWorkout?: StructuredWorkoutSpec | null;
};

const STRATEGY_F_WU_CD_PACE_SEC_PER_KM = 360; // 6:00/km
const STRATEGY_F_EASY_PACE_SEC_PER_KM = 330; // 5:30/km
const STRATEGY_F_RECOVERY_PACE_SEC_PER_KM = 300; // 5:00/km
const STRATEGY_F_INTERVAL_PACE_MIN = 180; // 3:00/km
const STRATEGY_F_INTERVAL_PACE_MAX = 360; // 6:00/km

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

const INTERVAL_KEYWORDS =
  /interval|intervall|repeat|repetition|wiederholung|tempo|track|series/i;

// Full pattern: "5 × 2000m @ 4:10"
const INTERVAL_FULL_REGEX =
  /(\d+)\s*[×x]\s*(\d+)\s*(m|km|min)\s*(?:@|bei|in)\s*([\d:]+)/i;

// Basic pattern without pace: "5×2000m", "10x400m"
const INTERVAL_BASIC_REGEX = /(\d+)\s*[×x]\s*(\d+)\s*(m|km|min)/i;

export function detectIntervalWorkout(
  sessionType?: string | null,
  sessionTitle?: string | null,
  planDescription?: string | null,
): boolean {
  const st = String(sessionType || "").toLowerCase().trim();
  const title = typeof sessionTitle === "string" ? sessionTitle : "";
  const paceLabel = typeof planDescription === "string" ? planDescription : "";
  const repsInText =
    INTERVAL_FULL_REGEX.test(title) ||
    INTERVAL_BASIC_REGEX.test(title) ||
    INTERVAL_FULL_REGEX.test(paceLabel) ||
    INTERVAL_BASIC_REGEX.test(paceLabel);

  // Planned "tempo" is often continuous threshold work — keyword "tempo" alone must not enable
  // segment-derived scoring unless repeats are explicit or interval cues appear in text.
  if (st === "tempo" && !repsInText) {
    const softCue = `${title} ${paceLabel}`;
    const hasStructuralCue =
      /interval|intervall|repeat|repetition|wiederholung|track|series/i.test(softCue) ||
      /\d+\s*[×x]\s*\d+\s*(m|km|min)/i.test(softCue);
    if (!hasStructuralCue) return false;
  }

  const combined = [sessionType, sessionTitle, planDescription].filter(Boolean).join(" ");
  if (!combined) return false;
  return (
    INTERVAL_KEYWORDS.test(combined) ||
    INTERVAL_FULL_REGEX.test(combined) ||
    INTERVAL_BASIC_REGEX.test(combined)
  );
}

/**
 * Sub-km reps: times like 0:42 / 1:28 are rep split durations, not min:sec per km.
 * When rep is in meters, distance &lt; 1000, and naive mm:ss as sec/km is &lt; 120, convert to sec/km.
 */
function targetPaceSecPerKmFromRepPace(
  repUnit: "m" | "km" | "min",
  repDistanceMeters: number,
  paceToken: string,
): number | null {
  const parsedMmSsAsSec = parsePaceString(paceToken);
  if (parsedMmSsAsSec == null) return null;
  if (
    repUnit === "m" &&
    repDistanceMeters > 0 &&
    repDistanceMeters < 1000 &&
    parsedMmSsAsSec < 120
  ) {
    return parsedMmSsAsSec / (repDistanceMeters / 1000);
  }
  return parsedMmSsAsSec;
}

export function parseIntervalPlanInfo(planDescription?: string | null): IntervalPlanInfo | null {
  if (planDescription == null || !String(planDescription).trim()) return null;

  const full = INTERVAL_FULL_REGEX.exec(planDescription);
  if (full) {
    const repCount = parseInt(full[1], 10);
    const repDistRaw = parseInt(full[2], 10);
    const repUnit = full[3].toLowerCase() as "m" | "km" | "min";
    const repDistanceMeters =
      repUnit === "km" ? repDistRaw * 1000 : repDistRaw;
    if (!Number.isFinite(repCount) || !Number.isFinite(repDistanceMeters)) return null;
    const targetPace = targetPaceSecPerKmFromRepPace(
      repUnit,
      repDistanceMeters,
      full[4],
    );
    return {
      repCount,
      repDistance: repDistanceMeters,
      repUnit,
      targetPaceSecPerKm: targetPace ?? undefined,
    };
  }

  const basic = INTERVAL_BASIC_REGEX.exec(planDescription);
  if (basic) {
    const repCount = parseInt(basic[1], 10);
    const repDistRaw = parseInt(basic[2], 10);
    const repUnit = basic[3].toLowerCase() as "m" | "km" | "min";
    const repDistanceMeters =
      repUnit === "km" ? repDistRaw * 1000 : repDistRaw;
    if (!Number.isFinite(repCount) || !Number.isFinite(repDistanceMeters)) return null;
    return {
      repCount,
      repDistance: repDistanceMeters,
      repUnit,
    };
  }

  const paceMatch = /([\d]+:[\d]{2})\s*\/\s*km/i.exec(planDescription);
  if (paceMatch) {
    const p = parsePaceString(paceMatch[1]);
    if (p == null) return null;
    return { targetPaceSecPerKm: p };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parsePaceString(s: string): number | null {
  const parts = s.split(":");
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0], 10);
  const sec = parseInt(parts[1], 10);
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(sec) ||
    min < 0 ||
    sec < 0 ||
    sec >= 60
  )
    return null;
  return min * 60 + sec;
}

/** Unix ms when parsable; otherwise 0 (caller must not throw). */
function toUnixMs(d: Date | number | string | undefined | null): number {
  if (d == null) return 0;
  if (typeof d === "number") return Number.isFinite(d) ? d : 0;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = new Date(String(d)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function lapPace(lap: WorkoutLap): number | null {
  if (
    lap.avgPaceSecPerKm != null &&
    Number.isFinite(lap.avgPaceSecPerKm) &&
    lap.avgPaceSecPerKm > 0
  )
    return lap.avgPaceSecPerKm;
  if (
    lap.distanceMeters != null &&
    lap.distanceMeters > 0 &&
    lap.durationSeconds > 0
  )
    return lap.durationSeconds / (lap.distanceMeters / 1000);
  return null;
}

function lapsHaveTimestampStructure(laps: WorkoutLap[]): boolean {
  if (!laps || laps.length < 2) return false;
  let ok = 0;
  for (const l of laps) {
    const s = toUnixMs(l.startDate);
    const e = toUnixMs(l.endDate);
    if (s > 0 && e > 0 && e >= s) ok++;
  }
  return ok >= 2;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
}

type LapWithPace = WorkoutLap & { computedPace: number };

/**
 * Bimodal classification: splits laps into "effort" and "recovery" groups
 * by finding the largest pace gap in the sorted distribution.
 * Entirely distance-agnostic.
 */
function bimodalClassify(laps: WorkoutLap[]): {
  effort: LapWithPace[];
  recovery: LapWithPace[];
  valid: boolean;
} {
  const withPace: LapWithPace[] = laps
    .map((lap) => ({ ...lap, computedPace: lapPace(lap) ?? -1 }))
    .filter(
      (lap): lap is LapWithPace =>
        lap.computedPace > 0 && Number.isFinite(lap.computedPace),
    );

  if (withPace.length < 2) return { effort: [], recovery: [], valid: false };

  const sorted = [...withPace].sort((a, b) => a.computedPace - b.computedPace);

  let maxGap = -Infinity;
  let splitIdx = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].computedPace - sorted[i].computedPace;
    if (gap > maxGap) {
      maxGap = gap;
      splitIdx = i;
    }
  }

  // Require a meaningful bimodal gap (≥ 10 s/km)
  if (maxGap < 10) return { effort: [], recovery: [], valid: false };

  const effort = sorted.slice(0, splitIdx + 1);
  const recovery = sorted.slice(splitIdx + 1);

  // Sanity checks: min duration 30 s, min distance 100 m (if known)
  const validEffort = effort.filter(
    (seg) =>
      seg.durationSeconds >= 30 &&
      (seg.distanceMeters == null || seg.distanceMeters >= 100),
  );

  // Need at least 2 valid effort segments
  if (validEffort.length < 2) return { effort: [], recovery: [], valid: false };

  return { effort: validEffort, recovery, valid: true };
}

type GpsSegmentBlock = {
  durationSeconds: number;
  avgPaceSecPerKm: number;
  startOffsetSec: number;
  endOffsetSec: number;
};

/**
 * Strategy C: segment a raw GPS pace stream into continuous blocks.
 */
function segmentGpsPaceStream(stream: GpsPacePoint[]): GpsSegmentBlock[] {
  if (stream.length < 2) return [];

  const SMOOTH_HALF = 7.5; // seconds either side
  const PACE_TOLERANCE = 20; // sec/km variance to stay in same segment
  const MIN_GAP = 10; // seconds

  const smoothed = stream.map((pt) => {
    const window = stream
      .filter(
        (p) => Math.abs(p.timeOffsetSeconds - pt.timeOffsetSeconds) <= SMOOTH_HALF,
      )
      .map((p) => p.paceSecPerKm)
      .sort((a, b) => a - b);
    return {
      t: pt.timeOffsetSeconds,
      pace: window[Math.floor(window.length / 2)],
    };
  });

  const segments: GpsSegmentBlock[] = [];
  let segStart = 0;
  let segPace = smoothed[0].pace;

  for (let i = 1; i <= smoothed.length; i++) {
    const last = i === smoothed.length;
    const diff = last ? Infinity : Math.abs(smoothed[i].pace - segPace);
    if (diff > PACE_TOLERANCE || last) {
      const segEnd = i - 1;
      const dur = smoothed[segEnd].t - smoothed[segStart].t;
      if (dur >= MIN_GAP) {
        segments.push({
          durationSeconds: dur,
          avgPaceSecPerKm: segPace,
          startOffsetSec: smoothed[segStart].t,
          endOffsetSec: smoothed[segEnd].t,
        });
      }
      if (!last) {
        segStart = i;
        segPace = smoothed[i].pace;
      }
    }
  }

  return segments;
}

function splitEntryToWorkoutLap(s: SplitEntry): WorkoutLap {
  const durationSeconds =
    typeof s.durationSeconds === "number" && Number.isFinite(s.durationSeconds) && s.durationSeconds > 0
      ? s.durationSeconds
      : typeof s.elapsedTimeSeconds === "number" && Number.isFinite(s.elapsedTimeSeconds) && s.elapsedTimeSeconds > 0
        ? s.elapsedTimeSeconds
        : 0;
  return {
    distanceMeters: s.distanceMeters,
    durationSeconds,
    avgPaceSecPerKm: s.avgPaceSecPerKm,
  };
}

function effortToIntervalSegments(effort: LapWithPace[]): IntervalSegment[] {
  return effort.map((seg) => ({
    startTime: toUnixMs(seg.startDate),
    endTime: toUnixMs(seg.endDate),
    durationSeconds: seg.durationSeconds,
    distanceMeters: seg.distanceMeters,
    avgPaceSecPerKm: seg.computedPace,
  }));
}

function lapsWithValidPace(lapInput: WorkoutLap[]): LapWithPace[] {
  return lapInput
    .map((lap) => ({ ...lap, computedPace: lapPace(lap) ?? -1 }))
    .filter(
      (lap): lap is LapWithPace =>
        lap.computedPace > 0 &&
        Number.isFinite(lap.computedPace) &&
        lap.durationSeconds >= 30 &&
        (lap.distanceMeters == null || lap.distanceMeters >= 100),
    );
}

/** Keep laps/splits whose distance matches planned rep length (excludes short recovery jogs). */
function filterLapsMatchingRepDistance(laps: WorkoutLap[], repDistanceMeters: number): WorkoutLap[] {
  if (!Number.isFinite(repDistanceMeters) || repDistanceMeters <= 0) return laps;
  const lo = repDistanceMeters * 0.75;
  const hi = repDistanceMeters * 1.25;
  return laps.filter((lap) => {
    const d = lap.distanceMeters;
    if (d == null || !Number.isFinite(d) || d <= 0) return true;
    return d >= lo && d <= hi;
  });
}

/**
 * Strategy D: when plan specifies N×Dm, take the N fastest rep-distance segments.
 * interval-only pace, do not include warm-up/cool-down/recovery — DO NOT REGRESS
 */
function extractByPlanFastestReps(
  lapInput: WorkoutLap[],
  plan: IntervalPlanInfo,
  extractionStrategy: ExtractionResult["extractionStrategy"],
): ExtractionResult | null {
  const repCount = plan.repCount;
  const repDistM = plan.repDistance;
  if (repCount == null || repCount < 1 || repDistM == null || repDistM <= 0) return null;

  const filtered = filterLapsMatchingRepDistance(lapInput, repDistM);
  const withPace = lapsWithValidPace(filtered);
  if (withPace.length < 2) return null;

  withPace.sort((a, b) => a.computedPace - b.computedPace);
  const take = Math.min(repCount, withPace.length);
  if (take < 2) return null;
  const effort = withPace.slice(0, take);
  return {
    effortSegments: effortToIntervalSegments(effort),
    extractionStrategy,
  };
}

type GpsPlanWindow = {
  avgPaceSecPerKm: number;
  startOffsetSec: number;
  endOffsetSec: number;
};

function mergePlanInfo(
  planDescription?: string | null,
  overrides?: IntervalPlanOverrides,
): IntervalPlanInfo | null {
  const parsed = parseIntervalPlanInfo(planDescription ?? null);
  if (!overrides?.repCount && !overrides?.repDistanceM) return parsed;
  const repCount =
    overrides.repCount != null && overrides.repCount > 0
      ? overrides.repCount
      : parsed?.repCount;
  const repDistance =
    overrides.repDistanceM != null && overrides.repDistanceM > 0
      ? overrides.repDistanceM
      : parsed?.repDistance;
  if (repCount == null && repDistance == null && !parsed) return null;
  return {
    ...parsed,
    repCount,
    repDistance,
    repUnit: parsed?.repUnit ?? (repDistance != null && repDistance >= 1000 ? "m" : parsed?.repUnit),
  };
}

/** Strategy E requires a dense GPS pace stream — sparse tracks produce unreliable windows. */
const STRATEGY_E_MIN_GPS_POINTS = 100;

/**
 * Strategy E: slide rep-distance windows along GPS pace stream; keep fastest non-overlapping reps.
 * interval-only pace, do not include warm-up/cool-down/recovery — DO NOT REGRESS
 */
function extractIntervalSegmentsFromGpsPlan(
  gpsStream: GpsPacePoint[],
  plan: IntervalPlanInfo,
): ExtractionResult | null {
  const repCount = plan.repCount;
  const repDistM = plan.repDistance;
  if (repCount == null || repCount < 1 || repDistM == null || repDistM <= 0) return null;

  const pts = gpsStream
    .filter(
      (p) =>
        Number.isFinite(p.timeOffsetSeconds) &&
        Number.isFinite(p.paceSecPerKm) &&
        p.paceSecPerKm > 0,
    )
    .sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);

  // eslint-disable-next-line no-console
  console.log("[PWS-DIAG:PACE] Strategy E (plan GPS windows) — GPS points available", {
    rawGpsPoints: gpsStream.length,
    validGpsPoints: pts.length,
    repCount,
    repDistanceM: repDistM,
    minRequired: STRATEGY_E_MIN_GPS_POINTS,
  });

  if (pts.length < STRATEGY_E_MIN_GPS_POINTS) return null;

  const windows: GpsPlanWindow[] = [];
  for (let i = 0; i < pts.length; i++) {
    let distM = 0;
    let paceWeighted = 0;
    let timeWeighted = 0;
    const startT = pts[i].timeOffsetSeconds;
    for (let j = i; j < pts.length - 1 && distM < repDistM; j++) {
      const dt = pts[j + 1].timeOffsetSeconds - pts[j].timeOffsetSeconds;
      if (!Number.isFinite(dt) || dt <= 0) continue;
      const speedMps = 1000 / pts[j].paceSecPerKm;
      const stepM = speedMps * dt;
      distM += stepM;
      paceWeighted += pts[j].paceSecPerKm * dt;
      timeWeighted += dt;
      if (distM >= repDistM) {
        const endT = pts[j + 1].timeOffsetSeconds;
        const avgPace =
          timeWeighted > 0 ? paceWeighted / timeWeighted : pts[j].paceSecPerKm;
        if (endT > startT && Number.isFinite(avgPace) && avgPace > 0) {
          windows.push({ avgPaceSecPerKm: avgPace, startOffsetSec: startT, endOffsetSec: endT });
        }
        break;
      }
    }
  }
  if (windows.length < 2) return null;

  windows.sort((a, b) => a.avgPaceSecPerKm - b.avgPaceSecPerKm);
  const picked: GpsPlanWindow[] = [];
  for (const w of windows) {
    if (picked.length >= repCount) break;
    const overlaps = picked.some(
      (p) => !(w.endOffsetSec <= p.startOffsetSec || w.startOffsetSec >= p.endOffsetSec),
    );
    if (!overlaps) picked.push(w);
  }
  if (picked.length < 2) return null;

  return {
    effortSegments: picked.map((w) => ({
      startTime: Math.round(w.startOffsetSec * 1000),
      endTime: Math.round(w.endOffsetSec * 1000),
      durationSeconds: Math.max(1, w.endOffsetSec - w.startOffsetSec),
      distanceMeters: repDistM,
      avgPaceSecPerKm: w.avgPaceSecPerKm,
    })),
    extractionStrategy: "gps_stream",
  };
}

function easyKmFromStructured(spec: StructuredWorkoutSpec): number {
  return (spec.steadyBlocksKm ?? []).reduce((acc, km) => {
    if (typeof km === "number" && Number.isFinite(km) && km > 0) return acc + km;
    return acc;
  }, 0);
}

function repParamsFromStructure(
  spec: StructuredWorkoutSpec,
  planInfo: IntervalPlanInfo | null,
): { repCount: number; repDistanceM: number } | null {
  const block = spec.intervals?.find(
    (b) => Number.isFinite(b.reps) && b.reps > 0 && Number.isFinite(b.distanceKm) && b.distanceKm > 0,
  );
  if (block) {
    return { repCount: block.reps, repDistanceM: block.distanceKm * 1000 };
  }
  if (
    planInfo?.repCount != null &&
    planInfo.repCount > 0 &&
    planInfo.repDistance != null &&
    planInfo.repDistance > 0
  ) {
    return { repCount: planInfo.repCount, repDistanceM: planInfo.repDistance };
  }
  return null;
}

/**
 * Strategy F — structure-aware pace from total duration minus estimated WU/CD/easy/recovery.
 */
function extractByStructureEstimate(
  totalDurationSec: number,
  structured: StructuredWorkoutSpec,
  planInfo: IntervalPlanInfo | null,
): ExtractionResult | null {
  const reps = repParamsFromStructure(structured, planInfo);
  if (!reps) return null;

  const warmupKm =
    typeof structured.warmupKm === "number" && structured.warmupKm > 0 ? structured.warmupKm : 0;
  const cooldownKm =
    typeof structured.cooldownKm === "number" && structured.cooldownKm > 0 ? structured.cooldownKm : 0;
  const easyKm = easyKmFromStructured(structured);
  const recoveryJogKm =
    typeof structured.recoveryJogKm === "number" && structured.recoveryJogKm > 0
      ? structured.recoveryJogKm
      : 0;

  const nonIntervalTimeSec =
    warmupKm * STRATEGY_F_WU_CD_PACE_SEC_PER_KM +
    cooldownKm * STRATEGY_F_WU_CD_PACE_SEC_PER_KM +
    easyKm * STRATEGY_F_EASY_PACE_SEC_PER_KM +
    recoveryJogKm * STRATEGY_F_RECOVERY_PACE_SEC_PER_KM;

  const intervalTimeSec = totalDurationSec - nonIntervalTimeSec;
  const intervalDistanceM = reps.repCount * reps.repDistanceM;

  const logInputs = {
    totalDurationSec,
    warmupKm,
    cooldownKm,
    easyKm,
    recoveryJogKm,
    nonIntervalTimeSec,
    intervalTimeSec,
    repCount: reps.repCount,
    repDistanceM: reps.repDistanceM,
    intervalDistanceM,
  };

  if (intervalTimeSec <= 0 || intervalDistanceM <= 0) {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy F result — rejected", {
      ...logInputs,
      reason: "non-positive interval time or distance",
    });
    return null;
  }

  const intervalPaceSecPerKm = intervalTimeSec / (intervalDistanceM / 1000);
  if (
    intervalPaceSecPerKm < STRATEGY_F_INTERVAL_PACE_MIN ||
    intervalPaceSecPerKm > STRATEGY_F_INTERVAL_PACE_MAX
  ) {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy F result — rejected", {
      ...logInputs,
      intervalPaceSecPerKm,
      reason: "pace outside 3:00–6:00/km sanity band",
    });
    return null;
  }

  // eslint-disable-next-line no-console
  console.log("[PWS-DIAG:PACE] Strategy F result", {
    ...logInputs,
    intervalPaceSecPerKm,
    extractionStrategy: "structure_estimated",
  });

  return {
    effortSegments: [
      {
        startTime: 0,
        endTime: 0,
        durationSeconds: intervalTimeSec,
        distanceMeters: intervalDistanceM,
        avgPaceSecPerKm: intervalPaceSecPerKm,
      },
    ],
    extractionStrategy: "structure_estimated",
  };
}

function isIntervalPaceDebug(): boolean {
  return (
    (typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
    (typeof process !== "undefined" && process.env.REACT_APP_DEBUG_AI === "1")
  );
}

// ---------------------------------------------------------------------------
// Public extraction API
// ---------------------------------------------------------------------------

export function extractIntervalSegments(
  laps?: WorkoutLap[] | null,
  gpsStream?: GpsPacePoint[] | null,
  splits?: SplitEntry[] | null,
  planDescription?: string | null,
  planOverrides?: IntervalPlanOverrides,
  structureEstimate?: StructureEstimateInput | null,
): ExtractionResult | null {
  const planInfo = mergePlanInfo(planDescription ?? null, planOverrides);
  const tryBimodal = (
    lapInput: WorkoutLap[],
    extractionStrategy: ExtractionResult["extractionStrategy"],
    strategyLabel: string,
  ): ExtractionResult | null => {
    if (!lapInput || lapInput.length < 2) {
      // eslint-disable-next-line no-console
      console.log(`[PWS-DIAG:PACE] Strategy ${strategyLabel} — skipped`, {
        reason: "fewer than 2 laps/splits",
        lapInputCount: lapInput?.length ?? 0,
      });
      return null;
    }
    const classified = bimodalClassify(lapInput);
    if (!classified.valid) {
      // eslint-disable-next-line no-console
      console.log(`[PWS-DIAG:PACE] Strategy ${strategyLabel} — fell through`, {
        reason: "bimodal classification invalid (gap < 10 s/km or < 2 effort segments)",
        lapInputCount: lapInput.length,
        effortCandidateCount: classified.effort.length,
        recoveryCandidateCount: classified.recovery.length,
      });
      return null;
    }
    const result = {
      effortSegments: effortToIntervalSegments(classified.effort),
      extractionStrategy,
    };
    // eslint-disable-next-line no-console
    console.log(`[PWS-DIAG:PACE] Strategy ${strategyLabel} — succeeded`, {
      effortSegments: result.effortSegments.length,
      extractionStrategy: result.extractionStrategy,
    });
    return result;
  };

  // Strategy A — HK / device laps with timestamps
  if (laps && laps.length >= 2 && lapsHaveTimestampStructure(laps)) {
    const r = tryBimodal(laps, "laps", "A (HK timestamp laps)");
    if (r != null) return r;
  } else {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy A (HK timestamp laps) — skipped", {
      reason:
        !laps || laps.length < 2
          ? "no laps or < 2 laps"
          : "laps lack timestamp structure",
      lapsCount: laps?.length ?? 0,
    });
  }

  // Strategy B — explicit auto-lap splits (no lap timestamps)
  if (splits && splits.length >= 2) {
    const lapLike = splits.map(splitEntryToWorkoutLap);
    const r = tryBimodal(lapLike, "splits", "B (explicit splits)");
    if (r != null) return r;
  } else {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy B (explicit splits) — skipped", {
      reason: "no splits or < 2 splits",
      splitsCount: splits?.length ?? 0,
    });
  }

  // Same as B: distance/duration lap rows without HK timestamps
  if (laps && laps.length >= 2 && !lapsHaveTimestampStructure(laps)) {
    const r = tryBimodal(laps, "splits", "B2 (laps without timestamps)");
    if (r != null) return r;
  } else if (laps && laps.length >= 2) {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy B2 (laps without timestamps) — skipped", {
      reason: "laps have HK timestamps (handled by Strategy A)",
      lapsCount: laps.length,
    });
  }

  // Strategy C — GPS pace stream (bimodal on pace-change blocks)
  if (gpsStream && gpsStream.length >= 10) {
    const blocks = segmentGpsPaceStream(gpsStream);
    const lapLike: WorkoutLap[] = blocks.map((b) => ({
      durationSeconds: b.durationSeconds,
      avgPaceSecPerKm: b.avgPaceSecPerKm,
      startDate: Math.round(b.startOffsetSec * 1000),
      endDate: Math.round(b.endOffsetSec * 1000),
    }));
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy C (GPS bimodal blocks) — attempting", {
      gpsPoints: gpsStream.length,
      paceBlocks: lapLike.length,
    });
    const r = tryBimodal(lapLike, "gps_stream", "C (GPS bimodal blocks)");
    if (r != null) return r;
  } else {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy C (GPS bimodal blocks) — skipped", {
      reason: "no gpsStream or < 10 points",
      gpsPoints: gpsStream?.length ?? 0,
    });
  }

  // Strategy D — plan N×Dm: fastest rep-distance laps/splits (excludes WU/CD/recovery by distance)
  if (planInfo?.repCount != null && planInfo.repDistance != null && planInfo.repDistance > 0) {
    if (splits && splits.length >= 2) {
      const lapLike = splits.map(splitEntryToWorkoutLap);
      const r = extractByPlanFastestReps(lapLike, planInfo, "splits");
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy D (plan fastest reps, splits) — result", {
        succeeded: r != null,
        effortSegments: r?.effortSegments.length ?? 0,
        repCount: planInfo.repCount,
        repDistanceM: planInfo.repDistance,
        splitsCount: splits.length,
        reason: r == null ? "extractByPlanFastestReps returned null" : undefined,
      });
      if (r != null) return r;
    } else {
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy D (plan fastest reps, splits) — skipped", {
        reason: "no splits or < 2 splits",
        splitsCount: splits?.length ?? 0,
      });
    }
    if (laps && laps.length >= 2) {
      const strat = lapsHaveTimestampStructure(laps) ? "laps" : "splits";
      const r = extractByPlanFastestReps(laps, planInfo, strat);
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy D (plan fastest reps, laps) — result", {
        succeeded: r != null,
        effortSegments: r?.effortSegments.length ?? 0,
        repCount: planInfo.repCount,
        repDistanceM: planInfo.repDistance,
        lapsCount: laps.length,
        reason: r == null ? "extractByPlanFastestReps returned null" : undefined,
      });
      if (r != null) return r;
    } else {
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy D (plan fastest reps, laps) — skipped", {
        reason: "no laps or < 2 laps",
        lapsCount: laps?.length ?? 0,
      });
    }
    if (gpsStream && gpsStream.length >= STRATEGY_E_MIN_GPS_POINTS) {
      const r = extractIntervalSegmentsFromGpsPlan(gpsStream, planInfo);
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy E (plan GPS windows) — result", {
        succeeded: r != null,
        effortSegments: r?.effortSegments.length ?? 0,
        repCount: planInfo.repCount,
        repDistanceM: planInfo.repDistance,
        gpsPoints: gpsStream.length,
        reason: r == null ? "extractIntervalSegmentsFromGpsPlan returned null" : undefined,
      });
      if (r != null) return r;
    } else {
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] Strategy E (plan GPS windows) — skipped", {
        reason: `no gpsStream or < ${STRATEGY_E_MIN_GPS_POINTS} points`,
        gpsPoints: gpsStream?.length ?? 0,
        minRequired: STRATEGY_E_MIN_GPS_POINTS,
      });
    }
  } else {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy D/E (plan-aware) — skipped", {
      reason: "planInfo missing repCount or repDistance",
      planInfo,
      planDescription,
    });
  }

  // Strategy F — total duration + structured plan (last resort)
  const totalDurationSec =
    typeof structureEstimate?.totalDurationSec === "number" &&
    Number.isFinite(structureEstimate.totalDurationSec) &&
    structureEstimate.totalDurationSec > 0
      ? structureEstimate.totalDurationSec
      : null;
  const structured = structureEstimate?.structuredWorkout ?? null;
  if (totalDurationSec != null && structured) {
    const r = extractByStructureEstimate(totalDurationSec, structured, planInfo);
    if (r != null) return r;
  } else {
    // eslint-disable-next-line no-console
    console.log("[PWS-DIAG:PACE] Strategy F (structure estimate) — skipped", {
      reason:
        totalDurationSec == null
          ? "missing totalDurationSec"
          : !structured
            ? "missing structuredWorkout"
            : "extractByStructureEstimate returned null",
      totalDurationSec,
      totalDistanceMeters: structureEstimate?.totalDistanceMeters ?? null,
      hasStructured: !!structured,
    });
  }

  // eslint-disable-next-line no-console
  console.log("[PWS-DIAG:PACE] extractIntervalSegments — final return", null);
  return null;
}

function meanEffortPace(extraction: ExtractionResult | null): number | null {
  if (!extraction || extraction.effortSegments.length === 0) return null;
  const paces = extraction.effortSegments
    .map((s) => s.avgPaceSecPerKm)
    .filter((p) => typeof p === "number" && Number.isFinite(p) && p > 0);
  if (paces.length === 0) return null;
  return mean(paces);
}

/**
 * interval-only pace, do not include warm-up/cool-down/recovery.
 * Mean pace of bimodal-classified effort laps/splits/GPS blocks only.
 */
export function computeIntervalOnlyAvgPaceSecPerKm(
  laps?: WorkoutLap[] | null,
  gpsStream?: GpsPacePoint[] | null,
  splits?: SplitEntry[] | null,
  planDescription?: string | null,
  planOverrides?: IntervalPlanOverrides,
  structureEstimate?: StructureEstimateInput | null,
): number | null {
  const lapCount = laps?.length ?? 0;
  const splitCount = splits?.length ?? 0;
  const gpsCount = gpsStream?.length ?? 0;

  // eslint-disable-next-line no-console
  console.log("[PWS-DIAG:PACE] computeIntervalOnlyAvgPaceSecPerKm — ALL inputs", {
    lapsCount: lapCount,
    splitsCount: splitCount,
    gpsStreamPointsCount: gpsCount,
    planDesc: planDescription ?? null,
  });

  const extraction = extractIntervalSegments(
    laps,
    gpsStream,
    splits,
    planDescription,
    planOverrides,
    structureEstimate,
  );
  const effortCount = extraction?.effortSegments.length ?? 0;
  const avgPace = meanEffortPace(extraction);

  // eslint-disable-next-line no-console
  console.log("[PWS-DIAG:PACE] computeIntervalOnlyAvgPaceSecPerKm — final return", {
    effortSegments: effortCount,
    extractionStrategy: extraction?.extractionStrategy ?? "none",
    avgPaceSecPerKm: avgPace,
  });

  if (isIntervalPaceDebug()) {
    // eslint-disable-next-line no-console
    console.log("[computeIntervalOnlyAvgPaceSecPerKm]", {
      lapsPassed: lapCount,
      splitsPassed: splitCount,
      gpsPointsPassed: gpsCount,
      effortSegments: effortCount,
      extractionStrategy: extraction?.extractionStrategy ?? "none",
      avgPaceSecPerKm: avgPace,
    });
  }

  return avgPace;
}

/** Single extraction pass: interval-only pace + segment score when plan target is known. */
export function extractIntervalMetrics(
  laps?: WorkoutLap[] | null,
  gpsStream?: GpsPacePoint[] | null,
  splits?: SplitEntry[] | null,
  planDescription?: string | null,
  planOverrides?: IntervalPlanOverrides,
  structureEstimate?: StructureEstimateInput | null,
): {
  avgPaceSecPerKm: number | null;
  intensityScore: number | null;
  extraction: ExtractionResult | null;
} {
  const extraction = extractIntervalSegments(
    laps,
    gpsStream,
    splits,
    planDescription,
    planOverrides,
    structureEstimate,
  );
  const avgPaceSecPerKm = meanEffortPace(extraction);
  if (!extraction || avgPaceSecPerKm == null) {
    return { avgPaceSecPerKm: null, intensityScore: null, extraction };
  }
  const planInfo = mergePlanInfo(planDescription ?? null, planOverrides);
  const targetPace = planInfo?.targetPaceSecPerKm ?? null;
  const { score } = scoreIntervalWorkout(
    extraction.effortSegments,
    targetPace ?? null,
    planInfo?.repCount ?? null,
    extraction.extractionStrategy,
  );
  return { avgPaceSecPerKm, intensityScore: score, extraction };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreIntervalWorkout(
  effortSegments: IntervalSegment[],
  targetPaceSecPerKm: number | null,
  targetReps: number | null,
  extractionStrategy: IntervalMeta["extractionStrategy"],
): { score: number; meta: IntervalMeta } {
  const completed = effortSegments.length;
  const paces = effortSegments.map((s) => s.avgPaceSecPerKm);
  const avgIntervalPace = mean(paces);
  const fastestRepPace = Math.min(...paces);
  const slowestRepPace = Math.max(...paces);
  const paceSD = stdDev(paces);

  let paceFadeDetected = false;
  if (paces.length >= 3) {
    const third = Math.max(1, Math.floor(paces.length / 3));
    const firstAvg = mean(paces.slice(0, third));
    const lastAvg = mean(paces.slice(paces.length - third));
    paceFadeDetected = lastAvg - firstAvg > 10;
  }

  let score: number;

  const noTarget = targetPaceSecPerKm == null || targetPaceSecPerKm <= 0;
  const noReps = targetReps == null || targetReps <= 0;

  if (noTarget) {
    const consistencyScore =
      paceSD < 5 ? 100 : paceSD < 10 ? 85 : paceSD < 20 ? 65 : paceSD < 30 ? 45 : 25;
    const repBonus = !noReps ? Math.min(completed / targetReps!, 1.0) * 10 : 0;
    score = Math.min(100, Math.round(consistencyScore + repBonus));
  } else {
    const repScore = noReps ? 40 : Math.min(completed / targetReps!, 1.0) * 40;

    const paceScores = effortSegments.map((seg) => {
      const delta = seg.avgPaceSecPerKm - targetPaceSecPerKm!;
      if (delta <= 0) return 100;
      if (delta <= 5) return 95;
      if (delta <= 10) return 88;
      if (delta <= 20) return 75;
      if (delta <= 30) return 58;
      if (delta <= 45) return 40;
      return Math.max(10, 40 - (delta - 45));
    });
    const avgPaceScore = mean(paceScores) * 0.6;

    const bonus = paceSD < 5 ? 5 : paceSD < 10 ? 2 : 0;

    score = Math.min(100, Math.round(repScore + avgPaceScore + bonus));
  }

  return {
    score,
    meta: {
      completedReps: completed,
      targetReps: noReps ? null : targetReps!,
      avgIntervalPace,
      targetPace: noTarget ? null : targetPaceSecPerKm!,
      fastestRepPace,
      slowestRepPace,
      paceFadeDetected,
      extractionStrategy,
    },
  };
}
