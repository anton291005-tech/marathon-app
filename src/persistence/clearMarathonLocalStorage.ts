import {
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
} from "../lib/supabase/migrations/migrateLocalDataToSupabase";
import { RESET_ONBOARDING_STORAGE_KEY } from "../onboarding/marathonPreferencesOnboarding";
import { ACCOUNT_BOUND_KEY_PREFIXES, KNOWN_MY_RACE_STORAGE_KEYS } from "./marathonLocalStorageKeys";
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
  // Trainings-Erinnerung (Uhrzeit, an/aus) und der Merker „Auswertung schon gezeigt“ gehören zum Konto: Läuft die
  // Sitzung ab und meldet sich ein anderes Konto an, bekäme es sonst Erinnerungen zur Uhrzeit des ersten.
  "myrace-notification-settings",
  "postWorkoutSummary_state_v2",
  // ENTSCHEIDUNG (Anton absegnen): Der weggeklickte Feedback-Eintrag auf „Heute" gilt nur bis zum Abmelden.
  // Die Wahl „Nutzungsdaten" gehört zur Person und liegt je Nutzer-ID (`marathonUsageEventsEnabled:<userId>`,
  // siehe telemetry/usageEvents.ts) — sie steht bewusst NICHT hier und übersteht Abmelden und Wiederanmelden.
  "marathonFeedbackEntryDismissed",
  "marathonUsageEventsThrottle",
  STORAGE_OWNER_USER_ID_KEY,
] as const;

/** Wird nach dem Löschen der lokalen Kontodaten auf `window` gemeldet. */
export const LOCAL_DATA_CLEARED_EVENT = "myrace:localDataCleared";

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
    // Schlüssel je Nutzer (Schicht-Modus): erst sammeln, dann löschen — Löschen verschiebt die Indizes.
    const accountBound: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && ACCOUNT_BOUND_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) accountBound.push(key);
    }
    accountBound.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Gesperrter Speicher (Privatmodus): Abmelden darf daran nicht scheitern.
  }
  // Zustand, der außerhalb von AppMain im Speicher liegt (z. B. die Erinnerungs-Einstellung im
  // NotificationProvider), muss denselben Stand bekommen — sonst gälte er für das nächste Konto weiter.
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCAL_DATA_CLEARED_EVENT));
  } catch {
    // ohne Event-API (alte Umgebung) bleibt es beim Löschen des Speichers
  }
}
