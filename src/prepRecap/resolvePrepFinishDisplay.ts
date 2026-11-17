/**
 * Welche Zielzeit Home, Leistung und der Coach-Kontext für die abgeschlossene Vorbereitung zeigen.
 *
 * 1. Datensatz (`prep_recaps`) mit Zeit → diese (bestätigt oder Apple-Health-Vorschlag). Ein Vorschlag aus
 *    dem Strava-Import steht dort nie (`decidePrepRecapAction`).
 * 2. Sonst die live erkannte Zeit (`detectRaceFinishTime`) – aus Strava mit `origin: "strava"`
 *    („laut Strava“, Powered by Strava, nicht an den Coach). Ist der Strava-Lauf weg, gibt es keine Zeit.
 */

import type { DetectedRaceFinish } from "./detectRaceFinishTime";
import type { PrepRecapRecord } from "./prepRecapRecord";
import type { RaceFinishDisplay } from "./raceResultPresentation";

export function resolvePrepFinishDisplay(args: {
  record: Pick<PrepRecapRecord, "raceDate" | "finishTimeSeconds" | "finishTimeConfirmed"> | null;
  raceYmd: string;
  detected: DetectedRaceFinish | null;
}): RaceFinishDisplay | null {
  const { record, raceYmd, detected } = args;
  if (record?.raceDate === raceYmd && record.finishTimeSeconds != null) {
    // Ein gespeicherter, unbestätigter Vorschlag stammt immer aus Apple Health (Strava wird nie gespeichert).
    return record.finishTimeConfirmed
      ? { seconds: record.finishTimeSeconds, confirmed: true }
      : { seconds: record.finishTimeSeconds, confirmed: false, origin: "apple_health" };
  }
  if (!detected) return null;
  return { seconds: detected.seconds, confirmed: false, origin: detected.origin === "strava" ? "strava" : "apple_health" };
}
