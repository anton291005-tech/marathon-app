/**
 * Match one normalized workout to at most one planned session of the same type and local day.
 */

import { normalizeCalendarDay, parseSessionDateLabel } from "../appSmartFeatures";
import type { PlanSession } from "../marathonPrediction";
import type { NormalizedAppleRun, RunMatchResult } from "./types";

const RUNNING_TYPES = new Set(["easy", "long", "interval", "tempo", "race"]);
const BIKE_TYPES = new Set(["bike"]);

function sessionLocalYmd(session: PlanSession): string | null {
  const pd = parseSessionDateLabel(session.date);
  if (!pd) return null;
  const x = normalizeCalendarDay(pd);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const d = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isRunningSession(s: PlanSession): boolean {
  return RUNNING_TYPES.has(s.type);
}

function isBikeSession(s: PlanSession): boolean {
  return BIKE_TYPES.has(s.type);
}

/**
 * Match a workout (run or bike) to a planned session of the same type on the same local date.
 */
export function matchWorkoutToPlannedSession(run: NormalizedAppleRun, plannedSessions: PlanSession[]): RunMatchResult {
  const isbike = run.type === "bike";
  const candidates = plannedSessions.filter(
    (s) => (isbike ? isBikeSession(s) : isRunningSession(s)) && sessionLocalYmd(s) === run.date,
  );

  if (candidates.length === 0) {
    return { matched: false, confidence: "low" };
  }

  if (candidates.length === 1) {
    const s = candidates[0];
    const plannedKm = s.km > 0 ? s.km : 0;
    let confidence: RunMatchResult["confidence"] = "high";
    if (plannedKm > 0) {
      const ratio = run.distanceKm / plannedKm;
      if (ratio < 0.78 || ratio > 1.22) confidence = "medium";
    } else {
      confidence = "medium";
    }
    return { matched: true, plannedSessionId: s.id, confidence };
  }

  const withPlannedKm = candidates.map((s) => ({
    session: s,
    plannedKm: s.km > 0 ? s.km : 0,
  }));

  withPlannedKm.sort((a, b) => {
    const da =
      a.plannedKm > 0 ? Math.abs(run.distanceKm - a.plannedKm) : Number.POSITIVE_INFINITY;
    const db =
      b.plannedKm > 0 ? Math.abs(run.distanceKm - b.plannedKm) : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return b.session.km - a.session.km;
  });

  const best = withPlannedKm[0].session;
  const second = withPlannedKm[1]?.session;
  const plannedKm = best.km > 0 ? best.km : 0;
  const distScore =
    plannedKm > 0 ? Math.abs(run.distanceKm - plannedKm) / plannedKm : 1;
  const ambiguous =
    second &&
    best.km > 0 &&
    second.km > 0 &&
    Math.abs(Math.abs(run.distanceKm - best.km) - Math.abs(run.distanceKm - second.km)) <
      0.25 * Math.max(best.km, second.km);

  let confidence: RunMatchResult["confidence"] = "high";
  if (ambiguous || distScore > 0.18) confidence = "medium";
  if (distScore > 0.35) confidence = "low";

  const longestFallback = [...candidates].sort((a, b) => b.km - a.km)[0];
  const chosen =
    best.km > 0 || candidates.every((c) => c.km <= 0) ? best : longestFallback;

  return { matched: true, plannedSessionId: chosen.id, confidence };
}

/** @deprecated Use matchWorkoutToPlannedSession instead */
export const matchRunToPlannedSession = matchWorkoutToPlannedSession;
