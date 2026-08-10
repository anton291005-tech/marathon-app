import type { TrainingPlanV2 } from "../planV2/types";
import type { WeekPhaseMeta } from "../core/getWorkoutPhase";
import type { ValidationContext } from "../ai/validation/validationContext";
import { trySwapWorkoutDatesInPlan } from "./trainingPlanSwapMutation";
import { buildValidationContext } from "../ai/validation/buildValidationContext";
import { buildSwapAthleteFacingWarnings, validateSwap } from "../ai/validation/validateSwap";

export type SwapWorkoutsV2Result =
  | { ok: false; message: string }
  | { ok: true; message: string; warningText: string | null; after: TrainingPlanV2 };

/**
 * Pure decision core for the live "swap two training days" flow (extracted from
 * `AppMain.tsx`'s `handleSwapWorkoutsV2`, no behavior change): resolves the swap,
 * runs the full validation stack (structural integrity + micro-structure/load-shift/
 * phase-swap/recovery), and returns the outcome. Persisting the result
 * (`setTrainingPlanV2`/`saveTrainingPlan`) stays the caller's responsibility.
 */
export function computeSwapWorkoutsV2Result(params: {
  before: TrainingPlanV2;
  sourceId: string;
  targetId: string;
  weekPhaseMap?: Map<string, WeekPhaseMeta> | null;
  planGoal?: ValidationContext["planGoal"];
  recoveryScore0_100?: number | null;
  recoveryConfidence?: number;
}): SwapWorkoutsV2Result {
  const { before, sourceId, targetId, weekPhaseMap, planGoal, recoveryScore0_100, recoveryConfidence } = params;

  if (!sourceId || !targetId || sourceId === targetId) {
    return { ok: false, message: "Ich habe nichts geändert (ungültige Auswahl)." };
  }

  const swapped = trySwapWorkoutDatesInPlan(before, sourceId, targetId);
  if (!swapped.ok) {
    const msg =
      swapped.reason === "missing_ids"
        ? "Ich konnte die beiden Einheiten nicht sicher finden."
        : swapped.reason === "integrity_failed"
          ? "Ich habe den Tausch abgebrochen (Integritätsprüfung fehlgeschlagen)."
          : "Ich habe nichts geändert (ungültige Auswahl).";
    return { ok: false, message: msg };
  }
  const after = swapped.after;

  const source = before.workouts.find((w) => w.id === sourceId) ?? null;
  const target = before.workouts.find((w) => w.id === targetId) ?? null;
  if (!source || !target) {
    return { ok: false, message: "Ich konnte die beiden Einheiten nicht sicher finden." };
  }

  const validationContext = buildValidationContext({
    before,
    after,
    targetWorkout: target,
    weekPhaseMap,
    planGoal: planGoal ?? "marathon",
    recoveryScore0_100: recoveryScore0_100 ?? null,
    recoveryConfidence,
  });
  const validation = validateSwap({ source, target, before, after, weekPhaseMap, validationContext });

  const axisReasons = [
    validation.axes?.structural?.reason,
    validation.axes?.load?.reason,
    validation.axes?.recovery?.reason,
    validation.axes?.micro?.reason,
  ].filter(Boolean) as string[];
  const athleteHints = buildSwapAthleteFacingWarnings({ before, after });
  const mergedWarnings = [...athleteHints, ...(validation.status === "warn" ? axisReasons : [])];
  const warningText = mergedWarnings.length > 0 ? Array.from(new Set(mergedWarnings)).join("\n\n") : null;

  return { ok: true, message: "Tausch übernommen.", warningText, after };
}
