/**
 * Der eine Hook-Punkt für Nutzungsereignisse des Schicht-Modus.
 *
 * Das Modul für Nutzungsdaten (`usage_events`, Migration 025) entsteht in einem anderen Branch (Arbeitsplan W3).
 * Bis dahin ist das hier ein No-op. W3 registriert genau einmal einen Empfänger:
 *
 *   import { setShiftUsageListener } from "../shift/shiftUsage";
 *   setShiftUsageListener((event, detail) => trackUsage(event, detail));
 *
 * Aufgerufen wird `reportShiftUsage` an diesen Stellen (sonst nirgends):
 *   - `shift_entries_saved`      → `src/shift/shiftStore.ts` `saveShiftChanges` nach dem Speichern (detail.count, detail.remote)
 *   - `shift_proposal_shown`     → `src/shift/shiftWeekScan.ts` `runShiftWeekScan`, wenn ein Vorschlag entsteht
 *   - `shift_proposal_accepted`  → `src/shift/shiftWeekScan.ts` `reportShiftProposalDecision(…, true)`
 *                                  (AppMain `handleConfirmWeekCalendarBatch`, „Übernehmen“)
 *   - `shift_proposal_declined`  → `src/shift/shiftWeekScan.ts` `reportShiftProposalDecision(…, false)`
 *                                  (AppMain `handleCancelWeekCalendarBatch`, „Verwerfen“)
 *
 * Inhalt: nur Zähler und Codes (keine Dienstzeiten, keine Titel). Schichtdaten gehen an kein Sprachmodell.
 */

export type ShiftUsageEvent = "shift_entries_saved" | "shift_proposal_shown" | "shift_proposal_accepted" | "shift_proposal_declined";

export type ShiftUsageDetail = Readonly<Record<string, string | number | boolean>>;

export type ShiftUsageListener = (event: ShiftUsageEvent, detail?: ShiftUsageDetail) => void;

let listener: ShiftUsageListener | null = null;

/** Registriert den Empfänger (ersetzt einen vorherigen); `null` meldet ab. */
export function setShiftUsageListener(next: ShiftUsageListener | null): void {
  listener = next;
}

export function reportShiftUsage(event: ShiftUsageEvent, detail?: ShiftUsageDetail): void {
  if (!listener) return;
  try {
    listener(event, detail);
  } catch {
    // Nutzungsdaten dürfen die App nie stören.
  }
}
