export type IntensityClassification = "too_easy" | "on_target" | "too_hard" | "overreaching";

export type IntervalSegment = {
  /** Unix ms; 0 if unknown. */
  startTime: number;
  /** Unix ms; 0 if unknown. */
  endTime: number;
  durationSeconds: number;
  distanceMeters?: number;
  avgPaceSecPerKm: number;
};

export type IntervalMeta = {
  completedReps: number;
  targetReps: number | null;
  avgIntervalPace: number; // sec/km
  targetPace: number | null; // sec/km
  fastestRepPace: number; // sec/km
  slowestRepPace: number; // sec/km
  paceFadeDetected: boolean;
  extractionStrategy: "laps" | "splits" | "gps_stream" | "structure_estimated" | "none";
};

export type Level2IntensityAnalysis = {
  level: 2;
  /** effortRatio = (durationMinutes * relative) / (durationMinutes * 1) => relative */
  effortRatio: number;
  /** load = durationMinutes * relative */
  load: number;
  intensityScore: number; // 0..100
  classification: IntensityClassification;
  model: "heart_rate" | "pace_only" | "interval";
  /** Where the intensity signal came from (UI-facing). */
  signalSource: "hr" | "pace_only" | "insufficient_data" | "interval_segments";
  /** 0..1, deterministic confidence for this analysis. */
  confidence: number;
  /** Only present when model === "interval". */
  intervalMeta?: IntervalMeta;
};

export type TrendKind = "overreaching" | "undertraining" | "balanced" | "risk" | "insufficient_data";

export type Level3TrendAnalysis = {
  level: 3;
  trend: TrendKind;
  confidence: number; // 0..1
  strain: number | null;
  loadTrend: number | null;
  recoverySlope: number | null;
};

export type CoachAction = "reduce_load" | "increase_load" | "increase_intensity" | "maintain";

export type CoachFeedback = {
  message: string;
  action: CoachAction;
};

export type RecoveryPoint = { date: string; score0_100: number };

export type WorkoutTrendDatum = {
  date: string; // YYYY-MM-DD local day key
  load: number;
  effortRatio: number;
};

export type WorkoutAnalysis = {
  level2: Level2IntensityAnalysis | null;
  level3: Level3TrendAnalysis | null;
  coach: CoachFeedback | null;
};

