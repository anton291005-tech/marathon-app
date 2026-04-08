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

export type RunEvaluationStatus =
  | "perfect"
  | "good"
  | "short"
  | "long"
  | "too_fast_easy"
  | "too_hard"
  | "too_easy"
  | "no_match";

export type RunEvaluation = {
  status: RunEvaluationStatus;
  distanceDeltaKm: number;
  paceDelta?: number;
  intensityFlag?: "low" | "ok" | "high";
};

export type CompletionDecision = {
  shouldWrite: boolean;
  setDone: boolean;
  setAssignedRun: boolean;
  reason: string;
};
