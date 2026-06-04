import {
  HEALTH_RUNS_STORAGE_KEY,
} from "../healthRuns";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "../persistence/marathonLocalStorageKeys";
import { RECOVERY_DAILY_STORAGE_KEY } from "../recovery/recoveryStorage";

/**
 * `App.tsx` registers `useEffect(…, [singleSlice])` persistence hooks in this declaration order.
 * After a React commit, effects run in this same order — **not** in dependency “importance” order.
 *
 * Use when reasoning about stale reads: e.g. `recoveryDailyRows` effect runs after `healthRuns`.
 *
 * **Derived (non-storage) refresh** (same file, illustrative — verify when editing):
 * - Apple Health → `logs` merge: effect on `[healthRuns]` calls `save(result.logs)` (runs after this wave on the *next* commit when `logs` updates).
 * - Training-load recommendation: effect on `[logs, aiPlanPatches, trainingPlanV2]` updates `trainingLoadRec`.
 */
export const APP_CORE_LOCALSTORAGE_EFFECT_ORDER: readonly string[] = [
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  MARATHON_AI_PLAN_PATCHES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
  HEALTH_RUNS_STORAGE_KEY,
  RECOVERY_DAILY_STORAGE_KEY,
];
