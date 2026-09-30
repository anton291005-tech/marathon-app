import type { PrepRecapRecord } from "../../prepRecap/prepRecapRecord";

/** Beschriftung der Zeit-Aktion (Outro-Slide, RaceResultCard). Eigenes Modul, damit AppMain die Story lazy laden kann. */
export function finishTimeActionLabel(record: Pick<PrepRecapRecord, "finishTimeSeconds" | "finishTimeConfirmed">): string {
  if (record.finishTimeSeconds == null) return "Zeit eintragen";
  return record.finishTimeConfirmed ? "Zeit bearbeiten" : "Zeit bestätigen";
}
