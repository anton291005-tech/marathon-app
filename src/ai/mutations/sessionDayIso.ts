import type { AiPlanSession } from "../../lib/ai/types";
import { dateIsoToYmd, sessionYmd } from "../../core/time/sessionDate";

type SessionDayLike = Pick<AiPlanSession, "id" | "date"> & { dateIso?: string };

/**
 * Kalendertag einer Session als YYYY-MM-DD — die einzige Datumsquelle der Kapazitäts-Kette
 * (`scanWeekForCalendarConflicts`, `buildCalendarReassignmentAction`, `validateWeekReassignmentBatch`,
 * `lockedSessions`).
 *
 * Bevorzugt `session.dateIso`, das das echte Jahr aus der TrainingPlanV2-SSOT trägt. Das
 * Anzeige-Label `session.date` ("14. Mär") hat kein Jahr; `sessionYmd` muss es daher raten und nimmt
 * dafür das Jahr der App-Uhr — über einen Jahreswechsel hinweg ist das falsch. Der Label-Pfad bleibt
 * nur als Legacy-Fallback für Plandaten ohne `dateIso` erhalten und meldet sich per `console.warn`,
 * damit solche Restbestände sichtbar werden statt still ein falsches Jahr zu liefern.
 */
export function sessionDayIso(session: SessionDayLike): string | null {
  const fromIso = dateIsoToYmd(session.dateIso);
  if (fromIso) return fromIso;

  const guessed = sessionYmd(session);
  if (!guessed) return null;
  // eslint-disable-next-line no-console
  console.warn(
    "[sessionDayIso] Session ohne dateIso — Jahr aus dem Label geraten (Legacy-Pfad, über den Jahreswechsel unzuverlässig)",
    { sessionId: session.id, dateLabel: session.date, guessedDayIso: guessed },
  );
  return guessed;
}
