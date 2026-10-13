/**
 * Deutsche Darstellung von Zahlen, Daten und Zielwerten (UI only — no business logic).
 * Regeln: docs/design-system/README.md („Sprache und Ton", „Typografie").
 */

const WEEKDAYS_SHORT_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const MONTHS_SHORT_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;

/** Kilometer mit Dezimalkomma: `15,9`. Mit `trimZero` ohne „,0" (`55`), für Sollwerte. */
export function formatKmDe(km: number, opts?: { trimZero?: boolean }): string {
  if (!Number.isFinite(km)) return "—";
  const rounded = Math.round(km * 10) / 10;
  const text = opts?.trimZero && Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return text.replace(".", ",");
}

/** „Do, 15. Okt" */
export function formatDayDateDe(date: Date): string {
  return `${WEEKDAYS_SHORT_DE[date.getDay()]}, ${date.getDate()}. ${MONTHS_SHORT_DE[date.getMonth()]}`;
}

/** Score 0–100 als ganze Zahl; ohne berechenbaren Wert `null` (Anzeige dann `—`). */
export function clampScore100(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Kürzt die Zielzeile der Herzfrequenz auf die Fakten-Zeile im Hero:
 * „Herzfrequenzbereich: Zone 2 (120–150 bpm, 60–75% HFmax)" → „Zone 2 · 120–150 bpm".
 * Ohne bpm-Bereich bleibt die Angabe in der Klammer stehen („Zone 2 · 60–75% HFmax").
 */
export function formatHrFactDe(line: string | null | undefined): string {
  const text = String(line ?? "")
    .replace(/^Herzfrequenzbereich:\s*/i, "")
    .trim();
  const withBpm = text.match(/^(.*?)\s*\((\d+\s*–\s*\d+\s*bpm)\b[^)]*\)$/);
  if (withBpm) return `${withBpm[1]} · ${withBpm[2]}`;
  const withNote = text.match(/^(.*?)\s*\(([^)]*)\)$/);
  if (withNote) return `${withNote[1]} · ${withNote[2]}`;
  return text;
}
