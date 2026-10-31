/**
 * Einzige Quelle für Pulszonen: Zone ↔ %HFmax-Band, Zone je Einheitentyp, bpm-Berechnung.
 * Karte, Detailansicht, Auswertung nach dem Training und Plan-Treue lesen alle hier — keine zweite Tabelle,
 * keine Prozent- oder bpm-Angaben im Plantext. Eine Zonensprache: Zone 1–5.
 */

export type HrZoneLabel = "Zone 1" | "Zone 2" | "Zone 3–4" | "Zone 4–5";

/** %HFmax-Bänder je Zonen-Label. */
export const HR_ZONE_PCT_BANDS: Record<HrZoneLabel, { lo: number; hi: number }> = {
  "Zone 1": { lo: 0.5, hi: 0.6 },
  "Zone 2": { lo: 0.6, hi: 0.75 },
  "Zone 3–4": { lo: 0.76, hi: 0.88 },
  "Zone 4–5": { lo: 0.8, hi: 0.95 },
};

/** Annahme für Plan-Treue-Scores, solange der Nutzer keine Max-HF gesetzt hat (nur Berechnung, keine Anzeige). */
export const FALLBACK_MAX_HR_BPM = 200;

/** Zone je Einheitentyp; lockere Läufe in Entlastungswochen liegen in Zone 1. */
export function zoneLabelForSessionType(
  sessionType: string | null | undefined,
  recoveryWeek = false,
): HrZoneLabel | null {
  switch (String(sessionType ?? "").toLowerCase()) {
    case "easy":
      return recoveryWeek ? "Zone 1" : "Zone 2";
    case "long":
    case "bike":
      return "Zone 2";
    case "tempo":
      return "Zone 3–4";
    case "interval":
    case "race":
      return "Zone 4–5";
    default:
      return null;
  }
}

function validMaxHr(maxHeartRateBpm: number | null | undefined, minExclusive = 0): number | null {
  return typeof maxHeartRateBpm === "number" && Number.isFinite(maxHeartRateBpm) && maxHeartRateBpm > minExclusive
    ? maxHeartRateBpm
    : null;
}

/**
 * Konkrete BPM-Range für ein Zonen-Label (z. B. „Zone 2“) + `maxHeartRateBpm`.
 * Liefert `null`, wenn die Zone unbekannt ist oder `maxHeartRateBpm` fehlt/ungültig ist
 * (kein Fake-Wert — die Zone wird dann ohne BPM-Range angezeigt).
 */
export function getHrRangeForZone(
  zoneLabel: string | null | undefined,
  maxHeartRateBpm?: number | null,
): { min: number; max: number } | null {
  if (!zoneLabel) return null;
  const band = HR_ZONE_PCT_BANDS[zoneLabel as HrZoneLabel];
  if (!band) return null;
  const mh = validMaxHr(maxHeartRateBpm);
  if (!mh) return null;
  return { min: Math.round(band.lo * mh), max: Math.round(band.hi * mh) };
}

/** Geplante bpm-Spanne einer Einheit für die Auswertung nach dem Training (Max-HF über 80 bpm nötig). */
export function plannedHrRangeForSessionType(
  sessionType: string,
  maxHrBpm?: number | null,
): { min: number; max: number } | null {
  return getHrRangeForZone(zoneLabelForSessionType(sessionType), validMaxHr(maxHrBpm, 80));
}

/** Anzeige der geplanten Pulsvorgabe: bpm-Spanne aus der Max-HF des Nutzers, sonst nur die Zone. */
export function formatPlannedHrDisplay(
  zoneLabel: string | null | undefined,
  hrBpm?: { min: number; max: number } | null,
): string {
  if (hrBpm && Number.isFinite(hrBpm.min) && Number.isFinite(hrBpm.max)) return `${hrBpm.min}–${hrBpm.max} bpm`;
  return zoneLabel ?? "–";
}
