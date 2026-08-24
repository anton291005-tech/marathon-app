import {
  loadWeeklyScheduleBlocks,
  replaceAllEventkitBlocks,
  type WeeklyScheduleBlock,
} from "../lib/supabase/services/weeklyScheduleBlocksService";
import { getAppCalendarYmd, getAppNow, getAppNowEpochMs } from "../core/time/timeSystem";
import {
  calendarCheckReadPermission,
  fetchCalendarOccurrences,
} from "./calendarImportService";
import { occurrencesToScheduleBlocks } from "./eventToScheduleBlocks";
import { loadCalendarSyncAnchors, saveCalendarSyncAnchors } from "./calendarSyncAnchorStore";

/**
 * Sync-Orchestrator für den EventKit-Import: Fenster berechnen → Vorkommen holen →
 * pure Domain-Mapping → Replace-All-Write (nur source='eventkit'-Zeilen).
 * Kein React-State; AppMain verdrahtet Connect (Onboarding) und Foreground-Resync.
 */

/** LocalStorage-Marker "Nutzer hat den Kalender verbunden" (Muster: APPLE_HEALTH_CONNECTED_KEY). */
export const CALENDAR_CONNECTED_KEY = "calendarImportConnected";

/** Import-Fenster: heute (lokal, inklusive) bis +27 Tage = 28 Tage. */
export const CALENDAR_IMPORT_WINDOW_DAYS = 28;

export type CalendarSyncResult = {
  ok: boolean;
  importedCount: number;
  error?: "fetch-failed" | "write-failed";
};

export function isCalendarImportConnected(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(CALENDAR_CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCalendarImportConnected(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CALENDAR_CONNECTED_KEY, "1");
  } catch {
    // quota / private mode
  }
}

/**
 * Voll-Import über das 28-Tage-Fenster. Bei Fetch-Fehler wird NICHT geschrieben
 * (ein Fehlschlag darf den bestehenden Import nicht leeren); leere Kalender leeren
 * die eventkit-Zeilen dagegen bewusst (Replace-All-Semantik).
 */
export async function runCalendarWindowSync(userId: string): Promise<CalendarSyncResult> {
  const now = getAppNow();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Exklusives Abfrage-Ende: Mitternacht nach dem letzten Fenstertag.
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + CALENDAR_IMPORT_WINDOW_DAYS);

  const occurrences = await fetchCalendarOccurrences(windowStart.getTime(), windowEnd.getTime());
  if (occurrences == null) return { ok: false, importedCount: 0, error: "fetch-failed" };

  const windowStartYmd = getAppCalendarYmd(windowStart);
  const windowEndYmd = getAppCalendarYmd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + CALENDAR_IMPORT_WINDOW_DAYS - 1)
  );
  const blocks = occurrencesToScheduleBlocks(occurrences, windowStartYmd, windowEndYmd);

  const writeResult = await replaceAllEventkitBlocks(userId, blocks);
  if (!writeResult.ok) return { ok: false, importedCount: 0, error: "write-failed" };

  saveCalendarSyncAnchors({ ...loadCalendarSyncAnchors(), lastSyncAt: new Date(getAppNowEpochMs()).toISOString() });
  return { ok: true, importedCount: writeResult.insertedCount };
}

/**
 * Foreground-Resync (appStateChange-Listener in AppMain): no-op, solange der Nutzer den
 * Kalender nie verbunden hat oder die Berechtigung inzwischen entzogen wurde. Liefert bei
 * Erfolg die frisch geladene Gesamt-Blockliste (alle sources) für setScheduleBlocks,
 * sonst null (Aufrufer lässt den State unangetastet).
 */
export async function runCalendarForegroundResync(userId: string): Promise<WeeklyScheduleBlock[] | null> {
  if (!isCalendarImportConnected()) return null;

  const permission = await calendarCheckReadPermission();
  if (permission !== "granted") return null;

  const syncResult = await runCalendarWindowSync(userId);
  if (!syncResult.ok) return null;

  return loadWeeklyScheduleBlocks(userId);
}
