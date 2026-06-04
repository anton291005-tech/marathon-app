import type { StoredHealthRun } from "../../healthRuns";
import type { SessionLog } from "../../marathonPrediction";
import type { RecoveryDailyRow } from "../../recovery/recoveryTypes";
import type { TrainingPlanV2 } from "../../planV2/types";

/**
 * Typed shapes for **`useAppCorePersistenceEffects` inputs**.
 *
 * - Runtime is still stringify → `localStorage`; these types document the intended wire shape.
 * - `readonly`/`Readonly` marks **intent**: callers must not mutate slices in-place after passing them here.
 */

/** Keys into `MARATHON_LOGS_KEY`; values are persisted session completions / notes — see `hydrateMarathonLogsFromStorage`. */
export type PersistedMarathonLogs = Readonly<Record<string, SessionLog>>;

export type RaceGoalPreference = "finish" | "time";

/** Subset persisted under `MARATHON_PREFERENCES_KEY` (extras allowed for forward compatibility). */
export type PersistedMarathonPreferences = Readonly<
  Partial<{
    targetTime: string | null;
    maxHeartRateBpm: number | null;
    onboardingComplete: boolean;
    raceDistanceLabel: string;
    raceDistanceKm: number | null;
    raceGoal: RaceGoalPreference;
    raceTargetTime: string | null;
    raceName: string | null;
    raceDate: string | null;
    planStartDate: string | null;
    weeklyKmRange: string;
    userPreferences: readonly string[];
  }>
>;

/** Alias — SSOT bleibt `PersistedMarathonPreferences`. */
export type PersistedPreferences = PersistedMarathonPreferences;

/** Wire shape under `TRAINING_PLAN_V2_STORAGE_KEY` after integrity validation at persist time. */
export type PersistedTrainingPlan = TrainingPlanV2;

/** Hydrated JSON under `MARATHON_AI_PLAN_PATCHES_KEY` — executed by `deriveDisplayPlan` via `applyPlanPatches`. */
export type PersistedAiPlanPatches = readonly unknown[] | unknown;

export type PersistedHealthRuns = readonly StoredHealthRun[];

export type PersistedRecoveryDailyRows = readonly RecoveryDailyRow[];

export type AppCorePersistenceSlices = {
  readonly logs: PersistedMarathonLogs;
  readonly preferences: PersistedPreferences;
  readonly aiPlanPatches: PersistedAiPlanPatches;
  readonly trainingPlanV2: PersistedTrainingPlan;
  readonly healthRuns: PersistedHealthRuns;
  readonly recoveryDailyRows: PersistedRecoveryDailyRows;
};
