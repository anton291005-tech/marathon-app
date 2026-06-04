import { analyzeIntensity } from "./analyzeIntensity";
import { analyzeTrend } from "./analyzeTrend";
import { buildCoachFeedback } from "./buildCoachFeedback";
import type { GpsPacePoint, SplitEntry, WorkoutLap } from "./intervalSegmentExtractor";
import type { RecoveryPoint, WorkoutAnalysis, WorkoutTrendDatum } from "./types";

function deepClone<T>(value: T): T {
  // Pure, deterministic clone for plain JSON-like inputs (analysis layer).
  // Never mutates original objects.
  try {
    // structuredClone is deterministic for identical inputs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (globalThis as any)?.structuredClone as undefined | ((v: any) => any);
    if (typeof sc === "function") return sc(value) as T;
  } catch {
    // fall through
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeAnalysisInputs(input: {
  workout: {
    durationMinutes: number | null;
    actualHrBpm: number | null;
    expectedHrBpm: number | null;
    actualPaceSecPerKm: number | null;
    plannedPaceSecPerKm: { min: number; max: number } | null;
  };
  history: WorkoutTrendDatum[];
  recovery: RecoveryPoint[] | null;
}): {
  workout: {
    durationMinutes: number | null;
    actualHrBpm: number | null;
    expectedHrBpm: number | null;
    actualPaceSecPerKm: number | null;
    plannedPaceSecPerKm: { min: number; max: number } | null;
  };
  history: WorkoutTrendDatum[];
  recovery: RecoveryPoint[] | null;
} {
  const cloned = deepClone(input);
  const history = Array.isArray(cloned.history) ? [...cloned.history] : [];
  history.sort((a, b) => String(a?.date).localeCompare(String(b?.date)));
  const recovery = cloned.recovery ? [...cloned.recovery] : null;
  if (recovery) recovery.sort((a, b) => String(a?.date).localeCompare(String(b?.date)));
  return { workout: cloned.workout, history, recovery };
}

export function analyzeWorkout(args: {
  workout: {
    durationMinutes: number | null;
    actualHrBpm: number | null;
    expectedHrBpm: number | null;
    actualPaceSecPerKm: number | null;
    plannedPaceSecPerKm: { min: number; max: number } | null;
  };
  history: WorkoutTrendDatum[];
  recovery: RecoveryPoint[] | null;
  /**
   * Optional interval context. When provided, interval detection and
   * segment-based scoring are attempted before standard intensity scoring.
   */
  intervalContext?: {
    sessionType?: string | null;
    sessionTitle?: string | null;
    /** Full plan description / pace label, e.g. "5×2000m @ 4:10/km". */
    planDescription?: string | null;
    laps?: WorkoutLap[] | null;
    gpsStream?: GpsPacePoint[] | null;
    splits?: SplitEntry[] | null;
  };
}): WorkoutAnalysis {
  const normalized = normalizeAnalysisInputs(args);
  const ic = args.intervalContext;
  const level2 = analyzeIntensity({
    ...normalized.workout,
    sessionType: ic?.sessionType,
    sessionTitle: ic?.sessionTitle,
    planDescription: ic?.planDescription,
    laps: ic?.laps,
    gpsStream: ic?.gpsStream,
    splits: ic?.splits,
  });
  const level3 = analyzeTrend({ history: normalized.history, recovery: normalized.recovery });
  const coach = buildCoachFeedback(level2, level3);
  return { level2, level3, coach };
}

