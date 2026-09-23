/**
 * Kalendertag einer Plan-Session für die Recovery-Kette.
 *
 * Alle Recovery-Fenster (Home-Score, Tageslast, Wochen-Rollups, Min-Data-Gate)
 * lasen das Datum bisher aus dem Anzeige-Label `session.date` ("14. Mär"), das
 * kein Jahr trägt — `parseSessionDateLabel` ergänzte still 2026. Über einen
 * Jahreswechsel hinweg fielen dadurch Dezember- und Januar-Tage in dasselbe
 * Jahr, und ab 2027 lag der ganze Plan im Vorjahr.
 *
 * Quelle ist jetzt `session.dateIso` (YYYY-MM-DD aus der TrainingPlanV2-SSOT,
 * gesetzt in `toPlanWeeks`). Der Label-Pfad bleibt nur als Legacy-Fallback über
 * `sessionDayIso` erhalten, das dabei per `console.warn` meldet, dass das Jahr
 * geraten wurde.
 */

import { sessionDayIso } from "../ai/mutations/sessionDayIso";

type SessionCalendarDayLike = { id: string; date: string; dateIso?: string };

export { sessionDayIso };

/**
 * Kalendertag als lokale Mittags-`Date` — dieselbe Tageszeit, die
 * `parseSessionDateLabel` lieferte, damit Fenstervergleiche gegen `now`
 * (z. B. das 14-Tage-Gate) unverändert rechnen.
 */
export function sessionCalendarDate(session: SessionCalendarDayLike): Date | null {
  const dayIso = sessionDayIso(session);
  if (!dayIso) return null;
  const [year, month, day] = dayIso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
