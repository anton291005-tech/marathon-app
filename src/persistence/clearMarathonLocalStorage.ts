import {
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
} from "../lib/supabase/migrations/migrateLocalDataToSupabase";
import { RESET_ONBOARDING_STORAGE_KEY } from "../onboarding/marathonPreferencesOnboarding";
import { KNOWN_MY_RACE_STORAGE_KEYS } from "./marathonLocalStorageKeys";
import { STORAGE_OWNER_USER_ID_KEY } from "./storageOwner";

/**
 * Konto-gebundene Schlüssel außerhalb des Katalogs. Die Sync-Anker (Apple Health, Kalender) gehören zum
 * Konto, nicht zum Gerät: Bliebe der Anker des ersten Kontos liegen, holte das zweite Konto nur noch die
 * Workouts/Termine seit dem letzten Sync des ersten — ältere Läufe fehlten ihm dauerhaft.
 */
export const ACCOUNT_BOUND_EXTRA_KEYS = [
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
  "marathon_migration_flags_v1",
  "marathon.coachMemory.v1",
  RESET_ONBOARDING_STORAGE_KEY,
  "appleHealthAnchors",
  "calendarSyncAnchors",
  "calendarImportConnected",
  "myrace-checkin-reminder",
  // Feedback-Eintrag auf „Heute" und Nutzungsdaten (Wahl + Drossel) gehören zur Person, nicht zum Gerät.
  "marathonFeedbackEntryDismissed",
  "marathonUsageEventsEnabled",
  "marathonUsageEventsThrottle",
  STORAGE_OWNER_USER_ID_KEY,
] as const;

/** Removes all marathon app data from localStorage (post sign-out / account deletion / account switch). */
export function clearMarathonLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    for (const key of KNOWN_MY_RACE_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    for (const key of ACCOUNT_BOUND_EXTRA_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Gesperrter Speicher (Privatmodus): Abmelden darf daran nicht scheitern.
  }
}
