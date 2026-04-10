export type {
  CompletionDecision,
  NormalizedAppleRun,
  RunCoachCategory,
  RunEvaluation,
  RunEvaluationStatus,
  RunMatchResult,
} from "./types";
export { normalizeAppleHealthRun } from "./normalizeAppleHealthRun";
export { matchRunToPlannedSession } from "./matchRunToPlannedSession";
export { evaluateRun, parsePlannedPaceMinPerKm } from "./evaluateRun";
export {
  generateRunEvaluationFeedback,
  getRunCoachVerdict,
  evaluationStatusLabel,
} from "./generateRunEvaluationFeedback";
export type { RunCoachVerdict } from "./generateRunEvaluationFeedback";
export { decideRunningCompletion } from "./completionDecision";
export { calculateStreak } from "./streak";
export { buildCompletedTrainingLocalDates } from "./buildCompletedTrainingDays";
export { applyAppleHealthTrainingSync } from "./applyAppleHealthSync";
