import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";
import type { SessionLog } from "../marathonPrediction";
import type { TrainingPlanV2 } from "../planV2/types";

/** Preferences written after onboarding — no merge with legacy local/remote fields. */
export function buildIsolatedOnboardingPreferences(
  patch: PersistedMarathonPreferences,
): PersistedMarathonPreferences {
  return {
    raceDistanceLabel: patch.raceDistanceLabel,
    raceDistanceKm: patch.raceDistanceKm ?? null,
    raceGoal: patch.raceGoal,
    raceTargetTime: patch.raceTargetTime ?? null,
    raceName: patch.raceName ?? null,
    raceDate: patch.raceDate ?? null,
    planStartDate: patch.planStartDate ?? null,
    weeklyKmRange: patch.weeklyKmRange,
    ...(patch.userPreferences?.length ? { userPreferences: [...patch.userPreferences] } : {}),
    onboardingComplete: true,
    targetTime: patch.raceGoal === "finish" ? null : patch.targetTime ?? null,
    maxHeartRateBpm: null,
  };
}

export function collectPlanSessionIds(plan: TrainingPlanV2 | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!plan) return ids;
  if (Array.isArray(plan.workouts)) {
    for (const w of plan.workouts) {
      if (w?.id) ids.add(w.id);
    }
  }
  if (ids.size === 0 && Array.isArray(plan.weeks)) {
    for (const week of plan.weeks) {
      for (const w of week.workouts ?? []) {
        if (w?.id) ids.add(w.id);
      }
    }
  }
  return ids;
}

/** Keeps completion logs only for sessions that exist in the new plan. */
export function detachSessionLogsFromPlan(
  logs: Record<string, SessionLog>,
  plan: TrainingPlanV2 | null | undefined,
): Record<string, SessionLog> {
  const ids = collectPlanSessionIds(plan);
  if (!ids.size) return {};
  const out: Record<string, SessionLog> = {};
  for (const [sessionId, log] of Object.entries(logs)) {
    if (ids.has(sessionId)) out[sessionId] = log;
  }
  return out;
}
