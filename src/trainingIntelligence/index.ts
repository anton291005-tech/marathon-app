export type {
  CompletionDecision,
  NormalizedAppleRun,
  RunEvaluation,
  RunEvaluationStatus,
  RunMatchResult,
} from "./types";
export { normalizeAppleHealthRun } from "./normalizeAppleHealthRun";
export { matchRunToPlannedSession } from "./matchRunToPlannedSession";
export { evaluateRun } from "./evaluateRun";
export {
  generateRunEvaluationFeedback,
  evaluationStatusLabel,
} from "./generateRunEvaluationFeedback";
export { decideRunningCompletion } from "./completionDecision";
export { calculateStreak } from "./streak";
export { buildCompletedTrainingLocalDates } from "./buildCompletedTrainingDays";
export { applyAppleHealthTrainingSync } from "./applyAppleHealthSync";
