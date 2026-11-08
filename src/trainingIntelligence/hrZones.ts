/**
 * Einzige Quelle für Pulszonen: Zone ↔ %HFmax-Band, Zone je Einheitentyp, bpm-Berechnung.
 * Karte, Detailansicht, Auswertung nach dem Training und Plan-Treue lesen alle hier — keine zweite Tabelle,
 * keine Prozent- oder bpm-Angaben im Plantext. Eine Zonensprache: Zone 1–5.
 */

import type { CoreKind } from "../planCore";

export type HrZoneLabel = "Zone 1" | "Zone 2" | "Zone 3" | "Zone 4" | "Zone 3–4" | "Zone 4–5";

/** %HFmax-Bänder je Zonen-Label. */
export const HR_ZONE_PCT_BANDS: Record<HrZoneLabel, { lo: number; hi: number }> = {
  "Zone 1": { lo: 0.5, hi: 0.6 },
  "Zone 2": { lo: 0.6, hi: 0.75 },
  // Vorläufig (Spoho-Review-Punkt 13, docs/plan-spec.md §14): "Zone 3–4" geteilt. Daniels setzt M/T eher bei ~80–90 % bzw. 88–92 % HFmax an.
  "Zone 3": { lo: 0.76, hi: 0.82 },
  "Zone 4": { lo: 0.82, hi: 0.88 },
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

/** App-Typ, auf den der Plan-Kern eine Art abbildet (docs/plan-core-plan.md, Abbildungstabelle). */
const SESSION_TYPE_OF_KIND: Record<CoreKind, string> = {
  REC: "easy",
  E: "easy",
  MLR: "easy",
  LR: "long",
  "LR+M": "long",
  M: "tempo",
  T: "tempo",
  I: "interval",
  R: "interval",
  RACE: "race",
  REST: "rest",
};

/**
 * Zone je Einheit. Ohne `kind` (Altpläne) exakt wie `zoneLabelForSessionType`. Mit `kind` (Plan-Kern) bestimmt die Art
 * die Zone: REC Z1, E/MLR/LR/LR+M Z2, M Z3, T Z4, I/R Z4–5. E bleibt in Entlastungswochen wie bisher in Z1.
 * RACE, REST und unbekannte Arten fallen auf die Zone des Typs zurück. Passt `kind` nicht zum Typ (z. B. nach einem
 * Patch, der nur `type` ändert), gilt der Typ.
 */
export function zoneLabelForSession(
  sessionType: string | null | undefined,
  kind: CoreKind | null | undefined,
  recoveryWeek = false,
): HrZoneLabel | null {
  const effectiveKind = kind && SESSION_TYPE_OF_KIND[kind] === String(sessionType ?? "").toLowerCase() ? kind : undefined;
  switch (effectiveKind) {
    case "REC":
      return "Zone 1";
    case "E":
      return recoveryWeek ? "Zone 1" : "Zone 2";
    case "MLR":
    case "LR":
    case "LR+M":
      return "Zone 2";
    case "M":
      return "Zone 3";
    case "T":
      return "Zone 4";
    case "I":
    case "R":
      return "Zone 4–5";
    default:
      return zoneLabelForSessionType(sessionType, recoveryWeek);
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

/**
 * Geplante bpm-Spanne einer Einheit für die Auswertung nach dem Training (Max-HF über 80 bpm nötig).
 * `recoveryWeek` wie auf der Karte: nur für `easy` in einer Entlastungswoche (dann Zone 1).
 */
export function plannedHrRangeForSessionType(
  sessionType: string,
  maxHrBpm?: number | null,
  kind?: CoreKind | null,
  recoveryWeek = false,
): { min: number; max: number } | null {
  return getHrRangeForZone(
    zoneLabelForSession(sessionType, kind, sessionType === "easy" && recoveryWeek),
    validMaxHr(maxHrBpm, 80),
  );
}

/** Anzeige der geplanten Pulsvorgabe: bpm-Spanne aus der Max-HF des Nutzers, sonst nur die Zone. */
export function formatPlannedHrDisplay(
  zoneLabel: string | null | undefined,
  hrBpm?: { min: number; max: number } | null,
): string {
  if (hrBpm && Number.isFinite(hrBpm.min) && Number.isFinite(hrBpm.max)) return `${hrBpm.min}–${hrBpm.max} bpm`;
  return zoneLabel ?? "–";
}
