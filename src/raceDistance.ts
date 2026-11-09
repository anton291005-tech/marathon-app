/**
 * Renndistanz des aktiven Plans: Kategorien, Beschriftungen, Riegel-Umrechnung und Splits (pure, UI-Texte).
 * Prognose, Rennrechner und Zielzeit-Eingabe richten sich danach — nichts ist fest auf Marathon verdrahtet.
 */

export const MARATHON_KM = 42.195;
export const HALF_MARATHON_KM = 21.0975;
const RIEGEL_EXPONENT = 1.06;

export type RaceDistanceKind = "5k" | "10k" | "half" | "marathon" | "other";

const KIND_TOLERANCE_KM = 0.5;

export function raceDistanceKind(km: number | null | undefined): RaceDistanceKind | null {
  if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return null;
  if (Math.abs(km - 5) < KIND_TOLERANCE_KM) return "5k";
  if (Math.abs(km - 10) < KIND_TOLERANCE_KM) return "10k";
  if (Math.abs(km - HALF_MARATHON_KM) < 1) return "half";
  if (Math.abs(km - MARATHON_KM) < 1) return "marathon";
  return "other";
}

/** Kanonische Distanz (5 / 10 / 21,0975 / 42,195) für bekannte Rennen, sonst der Wert selbst. */
export function canonicalRaceDistanceKm(km: number | null | undefined): number | null {
  const kind = raceDistanceKind(km);
  if (kind == null) return null;
  if (kind === "5k") return 5;
  if (kind === "10k") return 10;
  if (kind === "half") return HALF_MARATHON_KM;
  if (kind === "marathon") return MARATHON_KM;
  return km as number;
}

/** „5 km", „10 km", „Halbmarathon", „Marathon" bzw. „7,5 km"; `null` ohne Distanz. */
export function raceDistanceName(km: number | null | undefined): string | null {
  const canonical = canonicalRaceDistanceKm(km);
  if (canonical == null) return null;
  const kind = raceDistanceKind(canonical);
  if (kind === "half") return "Halbmarathon";
  if (kind === "marathon") return "Marathon";
  return `${String(Math.round(canonical * 10) / 10).replace(".", ",")} km`;
}

/** Titel der Prognosekarte: „10-km-Prognose", „Halbmarathon-Prognose", „Prognose" ohne Distanz. */
export function forecastTitle(km: number | null | undefined): string {
  const canonical = canonicalRaceDistanceKm(km);
  if (canonical == null) return "Prognose";
  const kind = raceDistanceKind(canonical);
  if (kind === "half") return "Halbmarathon-Prognose";
  if (kind === "marathon") return "Marathon-Prognose";
  return `${String(Math.round(canonical * 10) / 10).replace(".", ",")}-km-Prognose`;
}

/** Beispiel-Zielzeit für Platzhalter („z. B. 0:49:50"), passend zur Distanz. */
export function targetTimeExample(km: number | null | undefined): string {
  switch (raceDistanceKind(km)) {
    case "5k":
      return "0:24:30";
    case "10k":
      return "0:49:50";
    case "half":
      return "1:49:50";
    default:
      return "3:29:50";
  }
}

/** Riegel: Zeit über `fromKm` → Zeit über `toKm`. */
export function riegelConvertSeconds(seconds: number, fromKm: number, toKm: number): number {
  if (!(seconds > 0) || !(fromKm > 0) || !(toKm > 0)) return NaN;
  return seconds * Math.pow(toKm / fromKm, RIEGEL_EXPONENT);
}

/** Abstand der Zwischenzeiten im Rennrechner: 1 km bis 10 km, darüber 5 km. */
export function splitIntervalKm(km: number): number {
  return km <= 10.5 ? 1 : 5;
}

/** Kilometermarken der Zwischenzeiten (ohne Ziel) — z. B. 10 km → 1…9, Marathon → 5…40. */
export function splitMarksKm(km: number): number[] {
  const step = splitIntervalKm(km);
  const marks: number[] = [];
  for (let mark = step; mark < km - 0.05; mark += step) marks.push(mark);
  return marks;
}
