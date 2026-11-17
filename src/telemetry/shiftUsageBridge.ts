import { setShiftUsageListener } from "../shift/shiftUsage";
import { trackUsageEvent } from "./usageEvents";

/**
 * Verbindet den Hook-Punkt des Schicht-Modus (`src/shift/shiftUsage.ts`) mit den Nutzungsdaten (`usage_events`).
 * Weitergegeben werden nur der Ereignisname und bei `shift_entries_saved` die Anzahl; Dienstzeiten, Titel und
 * Gründe aus `detail` verlassen das Gerät nie (Props-Positivliste in `sanitizeUsageEventProps`).
 * Mehrfacher Aufruf ist unschädlich (ersetzt den Empfänger).
 */
export function connectShiftUsageToTelemetry(): void {
  setShiftUsageListener((event, detail) => {
    if (event === "shift_entries_saved") {
      const count = typeof detail?.count === "number" ? detail.count : Number.NaN;
      trackUsageEvent("shift_entries_saved", { count });
      return;
    }
    trackUsageEvent(event);
  });
}
