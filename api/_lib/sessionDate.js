"use strict";

/**
 * Kalendertag einer Plan-Session — Serverspiegel von `src/core/time/sessionDate.ts` (CRA lässt keinen
 * Import aus `api/` in den Client-Bundle zu, deshalb zwei Implementierungen; gepinnt über
 * `src/__tests__/sessionDateParity.test.js`).
 *
 * Das Label `session.date` ("28. Feb") trägt kein Jahr. Quelle der Wahrheit ist `session.dateIso`
 * (YYYY-MM-DD). Das Label wird nur ohne `dateIso` mit `fallbackYear` gelesen (Altpläne); der Server
 * übergibt dafür das Jahr von „heute" aus dem Request — ein Notnagel, kein Datum aus dem Plan.
 */

const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
const LABEL_PATTERN = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/;

const MONTH_INDEX_BY_LABEL = {
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

const pad2 = (n) => String(n).padStart(2, "0");

function isRealCalendarDay(year, month0, day) {
  const probe = new Date(Date.UTC(year, month0, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month0 && probe.getUTCDate() === day;
}

function labelToYmd(label, year) {
  if (typeof label !== "string") return null;
  const match = LABEL_PATTERN.exec(label);
  if (!match) return null;
  const day = Number(match[1]);
  const month0 = MONTH_INDEX_BY_LABEL[match[2]];
  if (month0 === undefined || !Number.isInteger(year)) return null;
  if (!isRealCalendarDay(year, month0, day)) return null;
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function dateIsoToYmd(dateIso) {
  if (typeof dateIso !== "string") return null;
  const match = YMD_PREFIX.exec(dateIso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isRealCalendarDay(year, month - 1, day)) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** `fallbackYear` ist Pflicht: der Server hat keine App-Uhr, den Notnagel liefert der Aufrufer. */
function sessionYmd(session, fallbackYear) {
  if (!session) return null;
  const fromIso = dateIsoToYmd(session.dateIso);
  if (fromIso) return fromIso;
  return labelToYmd(session.date, fallbackYear);
}

/** Lokale `Date` um 12:00 (wie bisher `parseSessionDateLabel`). */
function sessionDate(session, fallbackYear) {
  const ymd = sessionYmd(session, fallbackYear);
  if (!ymd) return null;
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

module.exports = { labelToYmd, dateIsoToYmd, sessionYmd, sessionDate };
