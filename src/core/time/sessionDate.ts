/**
 * Kalendertag einer Plan-Session — die einzige Stelle, an der aus einer Session ein Datum wird.
 *
 * Das Anzeige-Label `session.date` ("28. Feb") trägt kein Jahr. Wer es mit einem festen oder
 * Default-Jahr (2026, `now.getFullYear()`) zu einem Datum macht, liegt bei Plänen über Neujahr
 * (Start 07.11.2026, Rennen 28.02.2027) und ab 2027 generell falsch. Quelle der Wahrheit ist
 * `session.dateIso` (YYYY-MM-DD, gesetzt in `toPlanWeeks` aus der TrainingPlanV2-SSOT).
 *
 * Das Label wird nur gelesen, wenn `dateIso` fehlt (Altpläne), und dann mit `fallbackYear`
 * (Standard: Jahr von `getAppNow()`). Das ist ein Notnagel: Aufrufer, die ein besseres Jahr
 * kennen (Planstart, Rennjahr), reichen es als `fallbackYear` durch.
 *
 * Bewusst ohne Import aus `appSmartFeatures`, damit dieses Modul von dort importiert werden kann.
 */

import { getAppNow } from "./timeSystem";

export type SessionDateLike = {
  date?: string | null;
  dateIso?: string | null;
};

const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
const LABEL_PATTERN = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/;

const MONTH_INDEX_BY_LABEL: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Mär: 2,
  Apr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Dez: 11,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Gültiges Kalenderdatum? (verwirft 31. Feb, Monat 13, …) */
function isRealCalendarDay(year: number, month0: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month0, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month0 && probe.getUTCDate() === day;
}

/**
 * Liest ein Label ("28. Feb") mit explizitem Jahr als YYYY-MM-DD. `null`, wenn das Label nicht
 * lesbar ist. Exportiert für die wenigen Legacy-Pfade, die das Jahr selbst ableiten (Jahresanker).
 */
export function labelToYmd(label: unknown, year: number): string | null {
  if (typeof label !== "string") return null;
  const match = LABEL_PATTERN.exec(label);
  if (!match) return null;
  const day = Number(match[1]);
  const month0 = MONTH_INDEX_BY_LABEL[match[2]];
  if (month0 === undefined || !Number.isInteger(year)) return null;
  if (!isRealCalendarDay(year, month0, day)) return null;
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

/** `dateIso` als YYYY-MM-DD, falls vorhanden und ein echtes Datum (akzeptiert auch volle ISO-Strings). */
export function dateIsoToYmd(dateIso: unknown): string | null {
  if (typeof dateIso !== "string") return null;
  const match = YMD_PREFIX.exec(dateIso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isRealCalendarDay(year, month - 1, day)) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Kalendertag der Session als YYYY-MM-DD. `dateIso` hat Vorrang; das Label wird nur ohne `dateIso`
 * mit `fallbackYear` gelesen. `null`, wenn weder noch ein Datum ergibt.
 */
export function sessionYmd(session: SessionDateLike | null | undefined, fallbackYear?: number): string | null {
  if (!session) return null;
  const fromIso = dateIsoToYmd(session.dateIso);
  if (fromIso) return fromIso;
  return labelToYmd(session.date, fallbackYear ?? getAppNow().getFullYear());
}

/** Kalendertag der Session als lokale `Date` um 12:00 (wie bisher `parseSessionDateLabel`). */
export function sessionDate(session: SessionDateLike | null | undefined, fallbackYear?: number): Date | null {
  const ymd = sessionYmd(session, fallbackYear);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
