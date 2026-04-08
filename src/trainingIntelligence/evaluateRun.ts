/**
 * Plan vs actual — deterministic heuristics (no ML).
 */

import type { PlanSession } from "../marathonPrediction";
import type { NormalizedAppleRun, RunEvaluation } from "./types";

export function evaluateRun(plannedSession: PlanSession, actualRun: NormalizedAppleRun): RunEvaluation {
  const plannedKm = plannedSession.km > 0 ? plannedSession.km : 0;
  const actualKm = actualRun.distanceKm;
  const distanceDeltaKm = Math.round((actualKm - plannedKm) * 100) / 100;

  if (plannedKm <= 0 || actualKm <= 0) {
    return {
      status: "no_match",
      distanceDeltaKm,
      intensityFlag: "ok",
    };
  }

  const ratio = actualKm / plannedKm;
  const pace = actualRun.paceMinPerKm;
  const hr = actualRun.avgHeartRate;

  const easyFastPace = plannedSession.type === "easy" && pace > 0 && pace < 5.35;
  const easyHighHr =
    plannedSession.type === "easy" && hr !== null && hr >= 148;

  if (plannedSession.type === "easy" && (easyFastPace || easyHighHr)) {
    return {
      status: "too_fast_easy",
      distanceDeltaKm,
      intensityFlag: "high",
    };
  }

  if (["interval", "tempo", "race"].includes(plannedSession.type) && hr !== null && hr >= 168) {
    return {
      status: "too_hard",
      distanceDeltaKm,
      intensityFlag: "high",
    };
  }

  if (
    plannedSession.type === "easy" &&
    pace > 6.4 &&
    (hr === null || hr < 130)
  ) {
    return {
      status: "too_easy",
      distanceDeltaKm,
      intensityFlag: "low",
    };
  }

  let status: RunEvaluation["status"] = "good";
  if (ratio >= 0.97 && ratio <= 1.03) status = "perfect";
  else if (ratio < 0.9) status = "short";
  else if (ratio > 1.1) status = "long";

  return {
    status,
    distanceDeltaKm,
    intensityFlag: "ok",
  };
}
