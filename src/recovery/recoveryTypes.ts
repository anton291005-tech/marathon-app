/**
 * Recovery Intelligence — shared types (Apple Health aggregates + plan rollups).
 */

/** Per-sample trust weight after QC (never delete the underlying value). */
export type PhysioSignalMeta = {
  confidenceWeight: number;
  outlierFlag: boolean;
  reason?: string;
};

export type RecoverySignalMeta = {
  sleep?: PhysioSignalMeta;
  hrvMs?: PhysioSignalMeta;
  restingHr?: PhysioSignalMeta;
};

export type RecoveryDailyRow = {
  /** Local calendar day YYYY-MM-DD (wake day for sleep) */
  date: string;
  /** QC weights / outlier flags — optional for legacy persisted rows */
  signalMeta?: RecoverySignalMeta;
  sleepHours?: number;
  /** awake / inBed (0–1) */
  sleepFragmentation?: number;
  /** (rem+deep) / max(asleep,1) when stages exist */
  remDeepShare?: number;
  /** Kumulierte Wachminuten in der Nacht (Fragmentierung) */
  nightWakeMinutes?: number;
  /** Lokale Minuten ab Mitternacht — frühester Schlafbeginn (für Konsistenz-Trend) */
  sleepWindowStartMin?: number;
  /** Lokale Minuten — Ende der Hauptschlafperiode */
  sleepWindowEndMin?: number;
  /** Schlafsoll-Defizit vs. persönliche Baseline (Stunden), im Scoring berechnet/angereichert */
  sleepDebtHours?: number;
  /** Apple Health Active Energy burned (kcal) aggregated per local calendar day */
  activeEnergyKcal?: number;
  hrvMs?: number;
  restingHr?: number;
  respiratoryBrpm?: number;
  /** Rohwert Haut-/Körpertemp. °C (Finalisierung → Delta) */
  wristTempReadingC?: number;
  /** Abweichung von persönlichem Median (°C), nach Finalisierung */
  wristTempDeltaC?: number;
};

export type RecoverySubScores = {
  sleep: number;
  hrv: number;
  restingHr: number;
  respiratory: number;
  trainingLoad: number;
};

export type RecoveryWeights = {
  sleep: number;
  hrv: number;
  restingHr: number;
  respiratory: number;
  trainingLoad: number;
};

export const DEFAULT_RECOVERY_WEIGHTS: RecoveryWeights = {
  sleep: 0.4,
  hrv: 0.25,
  restingHr: 0.15,
  respiratory: 0.1,
  trainingLoad: 0.1,
};

export type ScoreConfidence = "full" | "partial" | "insufficient";

/** Multi-dimensional trust in the recovery readout (0–1 each). */
export type RecoveryConfidenceModel = {
  dataCompleteness: number;
  signalQuality: number;
  physiologicalStability: number;
  overallConfidence: number;
};

/** AI / copy tier — derived from confidence, not only coverage. */
export type RecoveryInsightDataMode = "full" | "partial" | "low";

/** Semantic interpretive state — does not alter numeric score. */
export type SemanticUncertaintyState = "lowUncertainty" | "mediumUncertainty" | "highUncertainty";

/** How the insight layer reasons about the signal (language + strength). */
export type AiReasoningMode = "deterministic" | "probabilistic" | "uncertain";

export type DailyRecoveryComputed = {
  date: string;
  /** Latent physiological state R_t ∈ [0,100] — source of truth for projections. */
  latentR: number;
  /** Noisy fusion target before Kalman update (same scale as R). */
  observedRecoveryProxy?: number;
  /** Adaptive gain K used for R update (Kalman-light). */
  latentK?: number;
  /** Projection: round(R_t) — optional compact display; not used for logic. */
  rawScore: number;
  /** Same projection as rawScore (legacy alias for UI). */
  score: number;
  /**
   * EMA + rolling blend of R_t only — no score pipeline.
   * Use for sparklines / secondary display; truth remains latentR.
   */
  smoothedLatentR: number;
  sub: Partial<Omit<RecoverySubScores, "trainingLoad">> & { trainingLoad: number };
  /** Anteil der Kerndimensionen (Schlaf/HRV/RHR) mit Messung */
  coverage: number;
  scoreConfidence: ScoreConfidence;
  recoveryConfidence: RecoveryConfidenceModel;
  insightDataMode: RecoveryInsightDataMode;
  semanticUncertaintyState: SemanticUncertaintyState;
  aiReasoningMode: AiReasoningMode;
};

export type RecoveryWeekRollup = {
  label: string;
  weekIndex: number;
  /** Mean latent R_t (R̂_t) for visible days in the week — always defined when the week has started. */
  recoveryScore: number | null;
  /** Half-width of uncertainty band for mini-trend (same units as R, 0–100). */
  latentTrendBandHalfWidth: number;
  sleepScoreAvg: number | null;
  hrvTrend: "up" | "down" | "flat" | "unknown";
  loadMarker: number;
  trend7: number[];
  sub: {
    sleepQualityLabel: string;
    stabilityLabel: string;
    loadBalanceLabel: string;
  };
  hasHealthData: boolean;
  scoreConfidence: ScoreConfidence;
  recoveryConfidence: RecoveryConfidenceModel | null;
  /** Short badge for UI, e.g. „Hoch / Mittel / Niedrig“ */
  confidenceBandLabel: string;
  dataQualityBadge: string | null;
  semanticUncertaintyState: SemanticUncertaintyState | null;
  certaintyLabel: string | null;
  aiReasoningMode: AiReasoningMode | null;
};

export type RecoveryInsight = {
  text: string;
  showWarning: boolean;
  dataMode: RecoveryInsightDataMode;
  recoveryConfidence: RecoveryConfidenceModel | null;
  semanticUncertaintyState: SemanticUncertaintyState | null;
  aiReasoningMode: AiReasoningMode | null;
};
