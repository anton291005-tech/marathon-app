/**
 * AI Coach data layer bridge: deterministic parsing + structured plan mutations executed after UI confirmation.
 * Reads via `AiContext` (plan, logs, profile, optional healthRuns); writes via `PlanPatch` overlay or full `TrainingPlanV2`.
 */
export { tryDeterministicCoachResponse, normalizeCoachText } from "./coachDeterministicResponses";
export {
  buildBoostNextWeekVolumePatches,
  buildInjuryNoRunningPatches,
  buildMissedWorkoutPatches,
  buildRemoveAllBikePatches,
  buildTaperWindowPatches,
  generateMarathonPlanV2ToRace,
} from "./coachPlanMutations";
