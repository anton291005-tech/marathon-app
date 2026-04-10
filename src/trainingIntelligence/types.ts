/**
 * Types for Apple Health → training intelligence (pure logic layer).
 */

export type NormalizedAppleRun = {
  id: string;
  date: string;
  /** YYYY-MM-DD local calendar day of workout start */
  startTime: number;
  endTime: number;
  durationMin: number;
  distanceKm: number;
  paceMinPerKm: number;
  avgHeartRate: number | null;
  calories: number | null;
  source: "appleHealth";
  type: "run";
};

export type RunMatchConfidence = "high" | "medium" | "low";

export type RunMatchResult = {
  matched: boolean;
  plannedSessionId?: string;
  confidence: RunMatchConfidence;
};

/** Eine eindeutige Coach-Kategorie nach Plan-vs-Ist-Logik */
export type RunCoachCategory =
  | "overload_risk"
  | "slightly_hard"
  | "low_stimulus"
  | "slightly_easy"
  | "ideal"
  | "too_much_volume"
  | "too_little_volume"
  | "ideal_distance_only"
  | "no_match";

/** @deprecated nutze RunCoachCategory — nur für ältere Logs / Leser */
export type RunEvaluationStatus = string;

export type RunEvaluation = {
  category: RunCoachCategory;
  distanceDeltaKm: number;
  /** Nur gesetzt, wenn Plan- und Ist-Tempo vergleichbar waren */
  paceRelation?: "too_fast" | "too_slow" | "on_pace";
  /** Nur bei overload_risk: Textvariante ohne falsche Tempo-Aussage */
  overloadKind?: "volume_only" | "pace_or_combo";
  intensityFlag?: "low" | "ok" | "high";
};

export type CompletionDecision = {
  shouldWrite: boolean;
  setDone: boolean;
  setAssignedRun: boolean;
  reason: string;
};
