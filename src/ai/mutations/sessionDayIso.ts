import type { AiPlanSession } from "../../lib/ai/types";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppCalendarYmd } from "../../core/time/timeSystem";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SessionDayLike = Pick<AiPlanSession, "id" | "date"> & { dateIso?: string };

/**
 * Kalendertag einer Session als YYYY-MM-DD — die einzige Datumsquelle der Kapazitäts-Kette
 * (`scanWeekForCalendarConflicts`, `buildCalendarReassignmentAction`, `validateWeekReassignmentBatch`,
 * `lockedSessions`).
 *
 * Bevorzugt `session.dateIso`, das das echte Jahr aus der TrainingPlanV2-SSOT trägt. Das
 * Anzeige-Label `session.date` ("14. Mär") hat kein Jahr; `parseSessionDateLabel` muss es daher raten
 * und nimmt dafür den hartkodierten Default 2026 — über einen Jahreswechsel hinweg (und ab 2027
 * generell) ist das falsch. Der Label-Pfad bleibt nur als Legacy-Fallback für Plandaten ohne
 * `dateIso` erhalten und meldet sich per `console.warn`, damit solche Restbestände sichtbar werden
 * statt still ein falsches Jahr zu liefern.
 */
export function sessionDayIso(session: SessionDayLike): string | null {
  const iso = session.dateIso;
  if (typeof iso === "string" && YMD_PATTERN.test(iso)) return iso;

  const parsed = parseSessionDateLabel(session.date);
  if (!parsed) return null;
  const guessed = getAppCalendarYmd(parsed);
  // eslint-disable-next-line no-console
  console.warn(
    "[sessionDayIso] Session ohne dateIso — Jahr aus dem Label geraten (Legacy-Pfad, über den Jahreswechsel unzuverlässig)",
    { sessionId: session.id, dateLabel: session.date, guessedDayIso: guessed },
  );
  return guessed;
}
