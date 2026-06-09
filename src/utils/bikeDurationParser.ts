/**
 * Parst die geplante Bike-Dauer aus dem desc-Freitext.
 * Beispiele: "45–60 min lockeres Radfahren" → 60 (Maxwert)
 *            "75 min Rennrad Zone 2"        → 75
 *            "60 min"                        → 60
 */
export function parseBikeDurationMinutes(desc?: string): number | null {
  if (!desc) return null;
  const match = desc.match(/(\d+)(?:[–-](\d+))?\s*min/i);
  if (!match) return null;
  // Wenn Range (z.B. 45–60): Maxwert nehmen als Zielwert
  return match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
}

export function parseBikeDurationSeconds(desc?: string): number | null {
  const min = parseBikeDurationMinutes(desc);
  return min != null ? min * 60 : null;
}

export function fmtBikePlannedDuration(desc?: string): string {
  const min = parseBikeDurationMinutes(desc);
  return min != null ? `${min} min` : "—";
}
