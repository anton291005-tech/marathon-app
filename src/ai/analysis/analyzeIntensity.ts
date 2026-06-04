import type { IntervalMeta, Level2IntensityAnalysis } from "./types";
import {
  detectIntervalWorkout,
  extractIntervalSegments,
  parseIntervalPlanInfo,
  scoreIntervalWorkout,
} from "./intervalSegmentExtractor";
import type { GpsPacePoint, SplitEntry, WorkoutLap } from "./intervalSegmentExtractor";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function midpoint(range: { min: number; max: number } | null | undefined): number | null {
  if (!range) return null;
  const a = Number(range.min);
  const b = Number(range.max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const mid = (lo + hi) / 2;
  return Number.isFinite(mid) ? mid : null;
}

function classifyEffortRatio(effortRatio: number): Level2IntensityAnalysis["classification"] {
  if (effortRatio < 0.85) return "too_easy";
  if (effortRatio <= 1.15) return "on_target";
  if (effortRatio <= 1.35) return "too_hard";
  return "overreaching";
}

function scoreFromEffortRatio(effortRatio: number): number {
  // Deterministic symmetric falloff around 1.0:
  // delta 0.0 => 100, delta 0.5+ => 0.
  const delta = Math.abs(1 - effortRatio);
  return clamp(Math.round(100 * (1 - clamp(delta / 0.5, 0, 1))), 0, 100);
}

export function analyzeIntensity(args: {
  durationMinutes: number | null;
  actualHrBpm: number | null;
  expectedHrBpm: number | null;
  actualPaceSecPerKm: number | null;
  plannedPaceSecPerKm: { min: number; max: number } | null;
  /** Optional — used for interval detection and segment-based scoring. */
  sessionType?: string | null;
  sessionTitle?: string | null;
  planDescription?: string | null;
  laps?: WorkoutLap[] | null;
  gpsStream?: GpsPacePoint[] | null;
  splits?: SplitEntry[] | null;
}): Level2IntensityAnalysis | null {
  const durationMinutes = typeof args.durationMinutes === "number" && Number.isFinite(args.durationMinutes) && args.durationMinutes > 0
    ? args.durationMinutes
    : null;
  if (!durationMinutes) return null;

  // ---- Interval branch (runs before any standard scoring) ----------------
  if (detectIntervalWorkout(args.sessionType, args.sessionTitle, args.planDescription)) {
    const planInfo = parseIntervalPlanInfo(args.planDescription);
    const extraction = extractIntervalSegments(
      args.laps,
      args.gpsStream,
      args.splits,
      args.planDescription ?? null,
    );

    if (extraction !== null) {
      const { score, meta } = scoreIntervalWorkout(
        extraction.effortSegments,
        planInfo?.targetPaceSecPerKm ?? null,
        planInfo?.repCount ?? null,
        extraction.extractionStrategy,
      );
      const load = durationMinutes * (score / 100);
      const confidence =
        extraction.extractionStrategy === "laps"
          ? 0.9
          : extraction.extractionStrategy === "gps_stream"
            ? 0.6
            : 0.75;
      return {
        level: 2,
        effortRatio: 1.0,
        load,
        intensityScore: score,
        classification: "on_target",
        model: "interval",
        signalSource: "interval_segments",
        confidence,
        intervalMeta: { ...meta, extractionStrategy: extraction.extractionStrategy },
      };
    }

    // Interval wording but no usable segments — never treat whole-session avg pace as the effort signal.
    const emptyMeta = (strategy: IntervalMeta["extractionStrategy"]): IntervalMeta => ({
      completedReps: 0,
      targetReps: planInfo?.repCount ?? null,
      avgIntervalPace: 0,
      targetPace: planInfo?.targetPaceSecPerKm ?? null,
      fastestRepPace: 0,
      slowestRepPace: 0,
      paceFadeDetected: false,
      extractionStrategy: strategy,
    });

    const exp = typeof args.expectedHrBpm === "number" && Number.isFinite(args.expectedHrBpm) && args.expectedHrBpm > 0
      ? args.expectedHrBpm
      : null;
    const act = typeof args.actualHrBpm === "number" && Number.isFinite(args.actualHrBpm) && args.actualHrBpm > 0
      ? args.actualHrBpm
      : null;
    if (act != null && exp != null) {
      const heartRateRelative = act / exp;
      if (Number.isFinite(heartRateRelative) && heartRateRelative > 0) {
        const effortRatio = heartRateRelative;
        const load = durationMinutes * heartRateRelative;
        const intensityScore = scoreFromEffortRatio(effortRatio);
        return {
          level: 2,
          effortRatio,
          load,
          intensityScore,
          classification: classifyEffortRatio(effortRatio),
          model: "interval",
          signalSource: "hr",
          confidence: clamp(0.55 + 0.25 * clamp01(intensityScore / 100), 0.55, 0.85),
          intervalMeta: emptyMeta("none"),
        };
      }
    }

    return {
      level: 2,
      effortRatio: 1,
      load: durationMinutes,
      intensityScore: 50,
      classification: "on_target",
      model: "interval",
      signalSource: "insufficient_data",
      confidence: 0.25,
      intervalMeta: emptyMeta("none"),
    };
  }
  // ---- End interval branch ------------------------------------------------

  const expectedHr = typeof args.expectedHrBpm === "number" && Number.isFinite(args.expectedHrBpm) && args.expectedHrBpm > 0
    ? args.expectedHrBpm
    : null;

  // Primary model: heart rate relative to expected HR.
  const actualHr = typeof args.actualHrBpm === "number" && Number.isFinite(args.actualHrBpm) && args.actualHrBpm > 0
    ? args.actualHrBpm
    : null;
  if (actualHr != null && expectedHr != null) {
    const heartRateRelative = actualHr / expectedHr;
    if (!Number.isFinite(heartRateRelative) || heartRateRelative <= 0) return null;
    const effortRatio = heartRateRelative;
    const load = durationMinutes * heartRateRelative;
    const intensityScore = scoreFromEffortRatio(effortRatio);
    return {
      level: 2,
      effortRatio,
      load,
      intensityScore,
      classification: classifyEffortRatio(effortRatio),
      model: "heart_rate",
      signalSource: "hr",
      confidence: clamp(0.8 + 0.2 * clamp01(intensityScore / 100), 0.8, 1.0),
    };
  }

  // Fallback: pace-only (missing HR).
  const plannedPaceMid = midpoint(args.plannedPaceSecPerKm);
  const actualPace = typeof args.actualPaceSecPerKm === "number" && Number.isFinite(args.actualPaceSecPerKm) && args.actualPaceSecPerKm > 0
    ? args.actualPaceSecPerKm
    : null;
  if (plannedPaceMid == null || actualPace == null) return null;

  // Faster than planned => higher intensity => higher relative.
  const paceRelative = plannedPaceMid / actualPace;
  if (!Number.isFinite(paceRelative) || paceRelative <= 0) return null;
  const effortRatio = paceRelative;
  const load = durationMinutes * paceRelative;
  const intensityScore = scoreFromEffortRatio(effortRatio);
  return {
    level: 2,
    effortRatio,
    load,
    intensityScore,
    classification: classifyEffortRatio(effortRatio),
    model: "pace_only",
    signalSource: "pace_only",
    confidence: clamp(0.25 + 0.35 * clamp01(intensityScore / 100), 0, 0.6),
  };
}

