/**
 * Plan vs. Ist — eine deterministische Coach-Kategorie (kein ML).
 */

import type { PlanSession } from "../marathonPrediction";
import type { NormalizedAppleRun, RunCoachCategory, RunEvaluation } from "./types";

/** |delta| <= 0.05 */
const DELTA_PERFECT = 0.05;
/** 0.05 < |delta| <= 0.15 */
const DELTA_SLIGHT_MAX = 0.15;
/** Abweichung Ist- vs. Plan-Tempo (min/km): Mitte aus 5–10 % */
const PACE_REL_BAND = 0.075;
/** Unter dieser Distanz (km) kein verlässliches Tempo aus Health ableiten */
const MIN_KM_FOR_PACE = 0.05;

/**
 * Plantempo aus Freitext (z. B. "5:30–5:50/km", "4:20/km"). Keine erfundenen Werte.
 */
export function parsePlannedPaceMinPerKm(pace: string | null | undefined): number | null {
  if (pace == null || typeof pace !== "string") return null;
  const t = pace.trim();
  if (!/\d/.test(t)) return null;

  const rangeM = t.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (rangeM) {
    const a = Number.parseInt(rangeM[1], 10) + Number.parseInt(rangeM[2], 10) / 60;
    const b = Number.parseInt(rangeM[3], 10) + Number.parseInt(rangeM[4], 10) / 60;
    return normalisePaceValue((a + b) / 2);
  }

  const singleM = t.match(/(\d{1,2}):(\d{2})\s*\/?\s*km\b/i);
  if (singleM) {
    const v = Number.parseInt(singleM[1], 10) + Number.parseInt(singleM[2], 10) / 60;
    return normalisePaceValue(v);
  }

  return null;
}

function normalisePaceValue(v: number): number | null {
  if (!Number.isFinite(v) || v < 3 || v > 15) return null;
  return Math.round(v * 100) / 100;
}

type DistanceBand = "perfect" | "slight" | "large";

function distanceBand(delta: number): DistanceBand {
  const a = Math.abs(delta);
  if (a <= DELTA_PERFECT) return "perfect";
  if (a <= DELTA_SLIGHT_MAX) return "slight";
  return "large";
}

type PaceRelation = "too_fast" | "too_slow" | "on_pace";

function paceRelation(actualMinPerKm: number, plannedMinPerKm: number): PaceRelation {
  const rel = (actualMinPerKm - plannedMinPerKm) / plannedMinPerKm;
  if (rel <= -PACE_REL_BAND) return "too_fast";
  if (rel >= PACE_REL_BAND) return "too_slow";
  return "on_pace";
}

function intensityFor(category: RunCoachCategory): "low" | "ok" | "high" {
  if (category === "overload_risk" || category === "slightly_hard") return "high";
  if (
    category === "low_stimulus" ||
    category === "slightly_easy" ||
    category === "too_little_volume"
  ) {
    return "low";
  }
  return "ok";
}

export function evaluateRun(plannedSession: PlanSession, actualRun: NormalizedAppleRun): RunEvaluation {
  const plannedKm = plannedSession.km > 0 ? plannedSession.km : 0;
  const actualKm = actualRun.distanceKm;
  const distanceDeltaKm = Math.round((actualKm - plannedKm) * 100) / 100;

  if (plannedKm <= 0 || actualKm <= 0) {
    return {
      category: "no_match",
      distanceDeltaKm,
      intensityFlag: "ok",
    };
  }

  const delta = (actualKm - plannedKm) / plannedKm;
  const band = distanceBand(delta);
  const more = delta > 0;
  const less = delta < 0;

  const plannedPaceMin = parsePlannedPaceMinPerKm(plannedSession.pace);
  const actualPaceUsable =
    actualRun.distanceKm >= MIN_KM_FOR_PACE &&
    actualRun.paceMinPerKm > 0 &&
    Number.isFinite(actualRun.paceMinPerKm);

  const paceOk = plannedPaceMin !== null && actualPaceUsable;
  const pr: PaceRelation | undefined = paceOk
    ? paceRelation(actualRun.paceMinPerKm, plannedPaceMin!)
    : undefined;

  let category: RunCoachCategory;
  let overloadKind: "volume_only" | "pace_or_combo" | undefined;

  if (pr !== undefined) {
    if (delta > DELTA_SLIGHT_MAX || (more && pr === "too_fast")) {
      category = "overload_risk";
      overloadKind =
        delta > DELTA_SLIGHT_MAX && pr !== "too_fast" ? "volume_only" : "pace_or_combo";
    } else if ((band === "slight" && pr === "too_fast") || (band === "perfect" && pr === "too_fast")) {
      category = "slightly_hard";
    } else if (less && pr === "too_slow") {
      category = "low_stimulus";
    } else if (band === "slight" && pr === "too_slow") {
      category = "slightly_easy";
    } else if (band === "perfect" && pr === "on_pace") {
      category = "ideal";
    } else if (less && pr === "too_fast") {
      category = "slightly_hard";
    } else if (more && pr === "too_slow") {
      category = "too_much_volume";
    } else if (less && pr === "on_pace" && band !== "perfect") {
      category = "too_little_volume";
    } else if (more && pr === "on_pace" && band === "slight") {
      category = "too_much_volume";
    } else {
      category = "ideal";
    }
  } else {
    if (delta > DELTA_SLIGHT_MAX) {
      category = "overload_risk";
      overloadKind = "volume_only";
    } else if (more && band !== "perfect") {
      category = "too_much_volume";
    } else if (less && band !== "perfect") {
      category = "too_little_volume";
    } else {
      category = "ideal_distance_only";
    }
  }

  return {
    category,
    distanceDeltaKm,
    ...(pr !== undefined ? { paceRelation: pr } : {}),
    ...(category === "overload_risk" && overloadKind ? { overloadKind } : {}),
    intensityFlag: intensityFor(category),
  };
}
