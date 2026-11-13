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
/** Prep-Rückblick-Snapshots (Cache/Offline-Kopie von `prep_recaps`), Map raceDate → Datensatz. */
export const PREP_RECAPS_CACHE_KEY = "prepRecaps";
/** Plan-eigene Preferences (Rennen, Ziel, Umfang) je Plan-ID — siehe `planOwnedPreferences`. */
export const PLAN_OWNED_PREFERENCES_KEY = "marathonPlanOwnedPreferences";
/** Nutzer-IDs, die auf diesem Gerät die KI-Einwilligung abgelehnt haben (→ nicht bei jedem Start fragen). */
export const AI_CONSENT_DECLINED_KEY = "marathonAiConsentDeclined";
/** Lokaler Cache der Morgen-Check-ins (letzte 14 Tage) inkl. noch nicht gespeicherter (`pending`). */
export const DAILY_CHECKINS_CACHE_KEY = "marathonDailyCheckins";
/** Kalendertag, an dem der Check-in mit „Heute nicht“ ausgeblendet wurde. */
export const CHECKIN_SKIPPED_DAY_KEY = "marathonCheckinSkippedDay";
/** Session-IDs, bei denen die Nachfrage „Wie anstrengend war …?“ mit „Später“ beendet wurde. */
export const RPE_PROMPT_DISMISSED_KEY = "marathonRpePromptDismissed";
/** Nutzer-IDs → Textversion, für die auf diesem Gerät die Gesundheits-Zustimmung abgelehnt/widerrufen wurde. */
export const HEALTH_CONSENT_DECLINED_KEY = "marathonHealthConsentDeclined";

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
  PREP_RECAPS_CACHE_KEY,
  PLAN_OWNED_PREFERENCES_KEY,
  AI_CONSENT_DECLINED_KEY,
  DAILY_CHECKINS_CACHE_KEY,
  CHECKIN_SKIPPED_DAY_KEY,
  RPE_PROMPT_DISMISSED_KEY,
  HEALTH_CONSENT_DECLINED_KEY,
];
