"use strict";

/**
 * Server-Kopie von `src/core/loadClass.ts` (einzige Quelle für die Belastungsklasse einer
 * Lauf-Session). api/ darf nicht aus src/ importieren und muss self-contained bleiben.
 * Der Paritätstest `src/core/loadClass.parity.test.ts` hält beide Dateien gleich —
 * Änderungen immer an beiden vornehmen. Regeln und Begründungen: siehe die TS-Datei.
 */

const RACE_PACE_MARKER_PATTERN =
  "(?:^|[^\\p{L}\\p{N}])(?:mp|marathon[\\s-]?pace|marathon[\\s-]?tempo|race[\\s-]?pace|goal[\\s-]?pace|renntempo|wettkampftempo|zieltempo)(?![\\p{L}\\p{N}])";

const RACE_PACE_MARKER = new RegExp(RACE_PACE_MARKER_PATTERN, "iu");

function hasRacePaceMarker(...texts) {
  const blob = texts.filter((t) => typeof t === "string" && t.length > 0).join("\n");
  return blob.length > 0 && RACE_PACE_MARKER.test(blob);
}

function lower(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isLongRunType(sessionType) {
  const t = lower(sessionType);
  return t === "long" || t === "long_run";
}

function classifyLoad(input) {
  const type = lower(input?.sessionType);
  const sport = lower(input?.sport);
  if (type === "rest" || sport === "rest") return "low";
  if (type === "interval" || type === "tempo" || type === "race") return "high";
  if (isLongRunType(type)) return hasRacePaceMarker(input?.title, input?.desc) ? "high" : "medium";
  return "low";
}

function resolveLoadClass(workout) {
  const sport = lower(workout?.sport);
  const stored = lower(workout?.intensity);
  const isRun = sport === "run" || (sport === "" && classifyLoad(workout) !== "low");
  if (!isRun && (stored === "low" || stored === "medium" || stored === "high")) return stored;
  return classifyLoad(workout);
}

module.exports = {
  RACE_PACE_MARKER_PATTERN,
  hasRacePaceMarker,
  isLongRunType,
  classifyLoad,
  resolveLoadClass,
};
