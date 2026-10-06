import type { Intensity } from "../planV2/types";

/**
 * Einzige Quelle für die Belastungsklasse einer Lauf-Session (Abstands-/Erholungsregeln,
 * Kalender-Fit, Plan-Normalisierung, Generatoren, Umwandlungen).
 *
 *   interval, race, tempo            → high
 *   long mit Renntempo-Anteil        → high
 *   long                             → medium
 *   easy, rest, strength, bike, swim → low
 *
 * Bewusst NICHT hierüber laufen UI-Zähler, Last-Gewichte für Recovery/Prognose und die
 * Coach-Heuristiken — das sind andere Begriffe von „hart" und würden sichtbare Zahlen ändern.
 *
 * Server-Kopie: `api/_lib/loadClass.js` (api/ darf nicht aus src/ importieren). Ein Paritätstest
 * (`loadClass.parity.test.ts`) hält beide Dateien gleich — Änderungen immer an beiden vornehmen.
 */

/**
 * Hinweise auf Renntempo im Titel/in der Beschreibung (case-insensitive, nur ganze Wörter):
 * „MP", „Marathon Pace/-Pace/pace", „Marathontempo", „Race Pace", „Goal Pace", „Renntempo",
 * „Wettkampftempo", „Zieltempo". „Tempodauerlauf" und „Camping" enthalten „mp" nur mittendrin
 * und treffen nicht. Kein Lookbehind: das iOS-Deployment-Target (WebKit < 16.4) parst ihn nicht.
 */
export const RACE_PACE_MARKER_PATTERN =
  "(?:^|[^\\p{L}\\p{N}])(?:mp|marathon[\\s-]?pace|marathon[\\s-]?tempo|race[\\s-]?pace|goal[\\s-]?pace|renntempo|wettkampftempo|zieltempo)(?![\\p{L}\\p{N}])";

const RACE_PACE_MARKER = new RegExp(RACE_PACE_MARKER_PATTERN, "iu");

export function hasRacePaceMarker(...texts: Array<string | null | undefined>): boolean {
  const blob = texts.filter((t): t is string => typeof t === "string" && t.length > 0).join("\n");
  return blob.length > 0 && RACE_PACE_MARKER.test(blob);
}

export type LoadClassInput = {
  sessionType?: string | null;
  sport?: string | null;
  title?: string | null;
  desc?: string | null;
};

function lower(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isLongRunType(sessionType: string | null | undefined): boolean {
  const t = lower(sessionType);
  return t === "long" || t === "long_run";
}

/** Belastungsklasse aus Session-Typ (+ Titel/Beschreibung für den Renntempo-Anteil). Rein und deterministisch. */
export function classifyLoad(input: LoadClassInput): Intensity {
  const type = lower(input.sessionType);
  const sport = lower(input.sport);
  if (type === "rest" || sport === "rest") return "low";
  if (type === "interval" || type === "tempo" || type === "race") return "high";
  if (isLongRunType(type)) return hasRacePaceMarker(input.title, input.desc) ? "high" : "medium";
  return "low";
}

/**
 * Klasse eines Workouts. Lauf-Sessions werden immer neu abgeleitet — ein gespeicherter Wert
 * (z. B. `long → low` aus älteren Claude-Plänen) zählt nicht. Rad/Kraft/Schwimmen behalten einen
 * gültigen gespeicherten Wert (Rad-Aufwand wird dort bewusst pro Einheit gepflegt).
 */
export function resolveLoadClass(
  workout: LoadClassInput & { intensity?: string | null },
): Intensity {
  const sport = lower(workout.sport);
  const stored = lower(workout.intensity);
  const isRun = sport === "run" || (sport === "" && classifyLoad(workout) !== "low");
  if (!isRun && (stored === "low" || stored === "medium" || stored === "high")) return stored;
  return classifyLoad(workout);
}
