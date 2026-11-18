/**
 * Zusatz zur Zeile „Aktuelle Prognose: H:MM:SS — …“ auf „Heute“: Abstand der Prognose zur EIGENEN Zielzeit.
 *
 * Vorher stand dort für jeden Marathonplan ein fester Bezug auf Sub-3h („52 min über Sub-3h“ bei Ziel 4:00:00).
 * ENTSCHEIDUNG (Anton absegnen): Bezug ist die Zielzeit des aktiven Plans; ohne Zielzeit (oder „Nur finishen“)
 * gibt es keinen Zusatz. Gilt für jede Distanz.
 */

/** Bis zu 5 Minuten über dem Ziel gilt als „knapp“. */
const NEAR_GOAL_SECONDS = 300;

export function prognosisGoalTag(predictedSeconds: number | null | undefined, targetSeconds: number | null | undefined): string | null {
  if (typeof predictedSeconds !== "number" || !Number.isFinite(predictedSeconds) || predictedSeconds <= 0) return null;
  if (typeof targetSeconds !== "number" || !Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
  if (predictedSeconds < targetSeconds) {
    return `${Math.max(1, Math.round((targetSeconds - predictedSeconds) / 60))} min unter deinem Ziel`;
  }
  if (predictedSeconds <= targetSeconds + NEAR_GOAL_SECONDS) return "knapp an deinem Ziel";
  return `${Math.max(1, Math.round((predictedSeconds - targetSeconds) / 60))} min über deinem Ziel`;
}
