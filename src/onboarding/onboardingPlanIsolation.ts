import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";
import type { SessionLog } from "../marathonPrediction";
import type { TrainingPlanV2 } from "../planV2/types";
import { replacePlanOwnedPreferences } from "./planOwnedPreferences";
import { scopeSessionLogsToPlan } from "../sessionLogs/scopeSessionLogsToPlan";

/**
 * Preferences nach dem Wizard: die plan-eigenen Felder kommen ausschließlich aus dem Wizard (kein
 * Merge mit denen des alten Plans). Alles, was der Wizard nicht abfragt (PR, HFmax, …), bleibt.
 */
export function buildIsolatedOnboardingPreferences(
  patch: PersistedMarathonPreferences,
  current: PersistedMarathonPreferences = {},
): PersistedMarathonPreferences {
  return {
    ...replacePlanOwnedPreferences(current, {
      raceDistanceLabel: patch.raceDistanceLabel,
      raceDistanceKm: patch.raceDistanceKm ?? null,
      raceGoal: patch.raceGoal,
      raceTargetTime: patch.raceTargetTime ?? null,
      raceName: patch.raceName ?? null,
      raceDate: patch.raceDate ?? null,
      planStartDate: patch.planStartDate ?? null,
      weeklyKmRange: patch.weeklyKmRange,
      ...(patch.userPreferences?.length ? { userPreferences: [...patch.userPreferences] } : {}),
      targetTime: patch.raceGoal === "finish" ? null : patch.targetTime ?? null,
    }),
    onboardingComplete: true,
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

/**
 * Keeps completion logs only for sessions that exist in the new plan — and never logs from before
 * `notBefore` (for a just-generated plan: now — it has no logs of its own yet): AI plans reuse ids like
 * `w5-mo`, so an id match alone would carry a previous prep over.
 */
export function detachSessionLogsFromPlan(
  logs: Record<string, SessionLog>,
  plan: TrainingPlanV2 | null | undefined,
  notBefore?: string | null,
): Record<string, SessionLog> {
  const ids = collectPlanSessionIds(plan);
  if (!ids.size) return {};
  const out: Record<string, SessionLog> = {};
  for (const [sessionId, log] of Object.entries(scopeSessionLogsToPlan(logs, plan, notBefore))) {
    if (ids.has(sessionId)) out[sessionId] = log;
  }
  return out;
}
