/**
 * Kalendertag und Montag einer `dateIso`, ohne Zeitzonen-Effekte.
 *
 * `dateIso` trägt den Kalendertag als `YYYY-MM-DD` (Konvention: `T12:00:00.000Z`). Rechnet man stattdessen mit lokaler
 * Zeit (`setHours(12)`, `getDay`) und liest das Ergebnis per `toISOString()` in UTC, fällt der Tag ab UTC+13
 * (Neuseeland im Sommer, Tonga, Samoa) auf den Vortag: lokal 12 Uhr ist dort schon 23 Uhr UTC des Vortags.
 * Deshalb zählt hier der geschriebene Kalendertag, gerechnet wird rein kalendarisch in UTC (`planCore/dates`).
 */

import { isYmd, mondayOf } from "../planCore/dates";

/** Kalendertag (`YYYY-MM-DD`) der `dateIso`; `null`, wenn sie kein gültiges Datum ist. */
export function calendarYmdOfDateIso(dateIso: string): string | null {
  if (typeof dateIso !== "string") return null;
  const parsed = new Date(dateIso);
  if (!Number.isFinite(parsed.getTime())) return null;
  const written = /^\d{4}-\d{2}-\d{2}/.exec(dateIso)?.[0];
  if (written) return isYmd(written) ? written : null;
  // Kein Kalendertag am Anfang (z. B. "Nov 9, 2026"): lokaler Kalendertag, wie `new Date` ihn liest.
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return isYmd(local) ? local : null;
}

/** Montag (`YYYY-MM-DD`) der Woche, in der die `dateIso` liegt; `null`, wenn sie kein gültiges Datum ist. */
export function mondayYmdOfDateIso(dateIso: string): string | null {
  const ymd = calendarYmdOfDateIso(dateIso);
  return ymd ? mondayOf(ymd) : null;
}
