"use strict";

/**
 * Whitelist für Health-Workouts, die an Claude gehen: Art, Start, Dauer, Distanz, Durchschnittspuls.
 * Der Client filtert bereits (`src/lib/ai/getAiContext.ts` `toCoachHealthRun`); hier noch einmal,
 * damit auch ein älterer oder fremder Client keine GPS-Verläufe, Runden, Quellnamen oder IDs durchreicht.
 */
function pickCoachHealthRunFields(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) return null;
  const picked = {};
  if (typeof run.workoutType === "string") picked.workoutType = run.workoutType;
  if (typeof run.startDate === "string") picked.startDate = run.startDate;
  if (typeof run.duration === "number" && Number.isFinite(run.duration)) picked.duration = run.duration;
  picked.distanceMeters =
    typeof run.distanceMeters === "number" && Number.isFinite(run.distanceMeters) ? run.distanceMeters : null;
  if (typeof run.avgHeartRateBpm === "number" && Number.isFinite(run.avgHeartRateBpm)) {
    picked.avgHeartRateBpm = run.avgHeartRateBpm;
  }
  return picked;
}

const STRAVA_SOURCE_PREFIX = "strava:";

function isStravaRunId(runId) {
  return typeof runId === "string" && runId.trim().toLowerCase().startsWith(STRAVA_SOURCE_PREFIX);
}

/**
 * Strava-Daten dürfen an kein Sprachmodell (Strava API Policy §5.3). Der Client filtert schon
 * (`src/lib/ai/getAiContext.ts`); hier noch einmal für ältere Clients, die `runId`/`sourceName` mitschicken.
 */
function isStravaSourcedCoachRun(run) {
  if (!run || typeof run !== "object") return false;
  if (isStravaRunId(run.runId) || isStravaRunId(run.platformId)) return true;
  return typeof run.sourceName === "string" && run.sourceName.trim().toLowerCase() === "strava";
}

/** Werte eines zugeordneten Strava-Laufs aus einem Session-Log entfernen (Spiegel des Clients). */
function stripStravaDerivedLogFields(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const scrubOne = (log) => {
    if (!log || typeof log !== "object" || Array.isArray(log)) return log;
    const fromStrava = isStravaRunId(log.assignedRun?.runId);
    const suggestedFromStrava = isStravaRunId(log.suggestedHealthRunId);
    if (!fromStrava && !suggestedFromStrava) return log;
    const { assignedRun, runEvaluation, suggestedHealthRunId, ...rest } = log;
    return {
      ...rest,
      ...(fromStrava ? {} : { assignedRun }),
      ...(fromStrava || suggestedFromStrava ? {} : { runEvaluation }),
      ...(suggestedFromStrava || suggestedHealthRunId === undefined ? {} : { suggestedHealthRunId }),
    };
  };
  // Zwei Formen: `{ sessionId, log }` (aktueller Client) oder flach `{ sessionId, ...log }`.
  if (entry.log && typeof entry.log === "object") return { ...entry, log: scrubOne(entry.log) };
  return scrubOne(entry);
}

module.exports = { pickCoachHealthRunFields, isStravaSourcedCoachRun, stripStravaDerivedLogFields };
