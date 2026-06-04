import { getSessionPlannedDistanceKm, type PlanWeek } from "../marathonPrediction";
import { sanitizeDistance } from "../sanitizeDistance";
import { weekPlannedRunningKm } from "../weeklyAnalysis";

/**
 * Normalized training stress index (higher = more load). Used only as 10% recovery context.
 */
export function weeklyTrainingStressIndex(week: PlanWeek): number {
  const hardCount = week.s.filter((session) => ["interval", "tempo", "race"].includes(session.type)).length;
  const weekVol = weekPlannedRunningKm(week);
  const longestRun = sanitizeDistance(
    week.s.reduce(
      (max, session) => Math.max(max, session.type === "long" ? getSessionPlannedDistanceKm(session) : 0),
      0,
    ),
    { weeklyAvgKm: Math.max(20, weekVol / 4) },
  );
  let score = 0;
  if (weekVol >= 80) score += 2;
  else if (weekVol >= 60) score += 1;
  if (hardCount >= 2) score += 1.5;
  else if (hardCount === 1) score += 0.75;
  if (longestRun >= 30) score += 1.5;
  else if (longestRun >= 24) score += 1;
  return score;
}

/** 0–100: higher = lighter week (easier on recovery budget). */
export function weeklyTrainingLoadSubscore(week: PlanWeek): number {
  const idx = weeklyTrainingStressIndex(week);
  return Math.max(35, Math.min(100, 100 - idx * 11));
}
