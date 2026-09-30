/**
 * Eingabe der Zielzeit (h:mm:ss) im Rückblick — reine Validierung, keine UI.
 * Zulässig 0:05:00 bis 9:59:59: deckt 5 km bis sehr langsame Marathons ab, fängt Tippfehler
 * wie „3:13" in den Stunden-/Minutenfeldern (→ 3 Minuten 13 Sekunden) ab.
 */

export const FINISH_TIME_MIN_SECONDS = 5 * 60;
export const FINISH_TIME_MAX_SECONDS = 10 * 3600 - 1;

export type FinishTimeParts = { hours: string; minutes: string; seconds: string };

export type FinishTimeParseResult =
  | { ok: true; seconds: number }
  | { ok: false; error: string | null };

export function splitFinishSeconds(total: number): FinishTimeParts {
  const s = Math.max(0, Math.round(total));
  return {
    hours: String(Math.floor(s / 3600)),
    minutes: String(Math.floor((s % 3600) / 60)).padStart(2, "0"),
    seconds: String(s % 60).padStart(2, "0"),
  };
}

/** Nur Ziffern, höchstens `maxLength` Stellen (Eingabe-Filter für die Felder). */
export function sanitizeTimeDigits(raw: string, maxLength: number): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/**
 * `error: null` = noch unvollständig (Speichern deaktiviert, aber keine Fehlermeldung).
 * Leere Minuten/Sekunden gelten erst als fertig, wenn die Stunden gesetzt sind.
 */
export function parseFinishTimeParts(parts: FinishTimeParts): FinishTimeParseResult {
  const { hours, minutes, seconds } = parts;
  if (!hours && !minutes && !seconds) return { ok: false, error: null };
  if (!hours || !minutes || !seconds) return { ok: false, error: null };
  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if (![h, m, s].every((n) => Number.isInteger(n) && n >= 0)) {
    return { ok: false, error: "Bitte nur Ziffern eingeben." };
  }
  if (m > 59 || s > 59) return { ok: false, error: "Minuten und Sekunden gehen nur bis 59." };
  const total = h * 3600 + m * 60 + s;
  if (total < FINISH_TIME_MIN_SECONDS || total > FINISH_TIME_MAX_SECONDS) {
    return { ok: false, error: "Bitte eine Zeit zwischen 0:05:00 und 9:59:59 eingeben." };
  }
  return { ok: true, seconds: total };
}
