import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { deriveDisplayPlan } from "../displayPlan/deriveDisplayPlan";
import type { TrainingPlanV2 } from "../planV2/types";

export type DisplayPlanInvariantResult = { ok: true } | { ok: false; reason: string };

/**
 * Read-side guard: V2 integrity + display projection has unique session ids and no null rows.
 * Does not mutate; safe to call after plan/patch writes.
 */
export function assertDisplayPlanInvariants(trainingPlanV2: TrainingPlanV2, patches: unknown): DisplayPlanInvariantResult {
  if (!validateTrainingPlanV2Integrity(trainingPlanV2)) {
    return { ok: false, reason: "trainingPlanV2_invalid" };
  }
  const display = deriveDisplayPlan(trainingPlanV2, patches);
  const seen = new Set<string>();
  for (const week of display) {
    if (!week || !Array.isArray(week.s)) {
      return { ok: false, reason: "week_sessions_missing" };
    }
    for (const s of week.s) {
      if (!s || typeof s.id !== "string" || !s.id.trim()) {
        return { ok: false, reason: "session_invalid" };
      }
      if (seen.has(s.id)) {
        return { ok: false, reason: "duplicate_session_id" };
      }
      seen.add(s.id);
    }
  }
  return { ok: true };
}
