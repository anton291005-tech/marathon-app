import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import type { PersistedMarathonPreferences } from "../app/runtime/runtimePersistenceTypes";
import type { TrainingPlanV2 } from "./types";

/** Session ids in the embedded Warsaw demo plan (e.g. `w01-mo`, `w25-so`). */
const LEGACY_EMBEDDED_WORKOUT_ID = /^w\d{2}-[a-z]{2}$/;

/** True when the plan was materialized from `LEGACY_EMBEDDED_PLAN_WEEKS` / `BASE_PLAN`. */
export function isEmbeddedLegacyTrainingPlan(plan: TrainingPlanV2 | null | undefined): boolean {
  if (!plan?.workouts?.length) return false;
  return plan.workouts.some((w) => LEGACY_EMBEDDED_WORKOUT_ID.test(String(w.id)));
}

/**
 * True when a persisted plan represents real user data (onboarding or coach-generated),
 * not the embedded demo/base plan shipped with the app.
 */
export function isUserTrainingPlan(
  plan: unknown,
  prefs?: PersistedMarathonPreferences | null,
): boolean {
  if (!plan || !validateTrainingPlanV2Integrity(plan as TrainingPlanV2)) return false;
  const typed = plan as TrainingPlanV2;
  if (isEmbeddedLegacyTrainingPlan(typed)) return false;
  if (prefs?.onboardingComplete === true) return true;
  return typed.workouts.some((w) => String(w.id).startsWith("coach-gen-"));
}
