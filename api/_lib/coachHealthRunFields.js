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

module.exports = { pickCoachHealthRunFields };
