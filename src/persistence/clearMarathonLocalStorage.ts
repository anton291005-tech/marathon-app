import {
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
} from "../lib/supabase/migrations/migrateLocalDataToSupabase";
import { RESET_ONBOARDING_STORAGE_KEY } from "../onboarding/marathonPreferencesOnboarding";
import { ACCOUNT_BOUND_KEY_PREFIXES, KNOWN_MY_RACE_STORAGE_KEYS } from "./marathonLocalStorageKeys";

const EXTRA_KEYS = [
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
  "marathon_migration_flags_v1",
  "marathon.coachMemory.v1",
  RESET_ONBOARDING_STORAGE_KEY,
] as const;

/** Removes all marathon app data from localStorage (post sign-out / account deletion). */
export function clearMarathonLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of KNOWN_MY_RACE_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
  for (const key of EXTRA_KEYS) {
    localStorage.removeItem(key);
  }
  // Schlüssel je Nutzer (Schicht-Modus): erst sammeln, dann löschen — Löschen verschiebt die Indizes.
  const accountBound: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && ACCOUNT_BOUND_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) accountBound.push(key);
  }
  accountBound.forEach((key) => localStorage.removeItem(key));
}
