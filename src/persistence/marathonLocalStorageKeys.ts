/**
 * Central string keys for MyRace local-first persistence (ownership + grep anchor).
 * Values must stay byte-identical to historic keys — do not rename without a migration.
 */

import { HEALTH_RUNS_STORAGE_KEY } from "../healthRuns";
import {
  RECOVERY_BOOT_PHASE_COMPLETE_KEY,
  RECOVERY_DAILY_STORAGE_KEY,
  RECOVERY_HAS_EVER_KPI_KEY,
  RECOVERY_HOME_SCORE_BY_DAY_KEY,
} from "../recovery/recoveryStorage";

export const MARATHON_LOGS_KEY = "marathonLogs";
export const MARATHON_PREFERENCES_KEY = "marathonPreferences";
export const MARATHON_AI_PLAN_PATCHES_KEY = "marathonAiPlanPatches";
export const TRAINING_PLAN_V2_STORAGE_KEY = "training_plan_v2";
export const MARATHON_APPLE_HEALTH_CONNECTED_KEY = "marathonAppleHealthConnected";
export const MARATHON_USER_ID_KEY = "marathonUserId";

/**
 * Read-only catalog for docs / debug (order is not normative).
 * Writers: App.tsx (core), recovery helpers, BackupControls, etc.
 */
export const KNOWN_MY_RACE_STORAGE_KEYS: readonly string[] = [
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
  MARATHON_AI_PLAN_PATCHES_KEY,
  HEALTH_RUNS_STORAGE_KEY,
  RECOVERY_DAILY_STORAGE_KEY,
  RECOVERY_HOME_SCORE_BY_DAY_KEY,
  RECOVERY_HAS_EVER_KPI_KEY,
  RECOVERY_BOOT_PHASE_COMPLETE_KEY,
  MARATHON_APPLE_HEALTH_CONNECTED_KEY,
  MARATHON_USER_ID_KEY,
];
