import { useEffect, useRef } from "react";
import { updateTrainingPlanGoalMeta } from "../lib/supabase/services/trainingPlanService";
import { readPlanGoalMeta, samePlanGoal, withPlanGoalMeta } from "./planGoalMeta";
import type { PlanGoalMetaV2, TrainingPlanV2 } from "./types";

type Args = {
  userId: string | null;
  /** Zeilen-ID des aktiven Plans (`training_plans.id`). */
  activePlanId: string | null;
  /** Plan und Preferences aus Supabase geladen. */
  hydrationReady: boolean;
  plan: TrainingPlanV2;
  setPlan: (updater: (prev: TrainingPlanV2) => TrainingPlanV2) => void;
  /** Ziel aus den Preferences, wenn sie nachweislich zum aktiven Plan gehören; sonst null (dann nichts schreiben). */
  preferencesGoal: PlanGoalMetaV2 | null;
  /** Besitzer der lokalen Preferences (`planOwnedPreferences`); null = unbekannt (frisches Gerät). */
  ownerPlanId: string | null;
  applyGoalToPreferences: (goal: PlanGoalMetaV2) => void;
  claimOwner: (planId: string) => void;
  saveGoal?: (userId: string, planId: string, goal: PlanGoalMetaV2) => Promise<boolean>;
  debounceMs?: number;
};

/**
 * Zielzeit am Plan halten (`meta.goal`):
 * 1. Lesen: Kennt das Gerät den Besitzer der Preferences nicht (frisches Gerät, anderes Konto davor) und trägt der
 *    aktive Plan ein Ziel, gilt das Ziel des Plans — nicht die nutzerweite Profil-Zielzeit. Einmal je aktivem Plan.
 * 2. Schreiben: Gehören die Preferences zum aktiven Plan und weicht ihr Ziel vom Plan ab (Eingabe in den
 *    Einstellungen, Altplan ohne `meta.goal`), wird `meta.goal` verzögert lokal und per Zeilen-ID gespeichert.
 */
export function usePlanGoalSync({
  userId,
  activePlanId,
  hydrationReady,
  plan,
  setPlan,
  preferencesGoal,
  ownerPlanId,
  applyGoalToPreferences,
  claimOwner,
  saveGoal = updateTrainingPlanGoalMeta,
  debounceMs = 1200,
}: Args): void {
  const appliedForRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activePlanId);
  activeIdRef.current = activePlanId;
  const latest = useRef({ plan, preferencesGoal, ownerPlanId, applyGoalToPreferences, claimOwner, setPlan, saveGoal });
  latest.current = { plan, preferencesGoal, ownerPlanId, applyGoalToPreferences, claimOwner, setPlan, saveGoal };

  const goalKey = preferencesGoal ? `${preferencesGoal.raceGoal}|${preferencesGoal.targetTime ?? ""}` : "";
  const planGoal = readPlanGoalMeta(plan);
  const planGoalKey = planGoal ? `${planGoal.raceGoal}|${planGoal.targetTime ?? ""}` : "";

  useEffect(() => {
    if (!hydrationReady || !activePlanId || !userId) return;
    const cur = latest.current;
    if (appliedForRef.current !== activePlanId) {
      appliedForRef.current = activePlanId;
      const metaGoal = readPlanGoalMeta(cur.plan);
      if (metaGoal && cur.ownerPlanId !== activePlanId) {
        cur.applyGoalToPreferences(metaGoal);
        cur.claimOwner(activePlanId);
        return;
      }
    }
    const goal = cur.preferencesGoal;
    if (!goal || samePlanGoal(readPlanGoalMeta(cur.plan), goal)) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    const planId = activePlanId;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (activeIdRef.current !== planId) return;
      latest.current.setPlan((prev) => withPlanGoalMeta(prev, goal));
      void latest.current.saveGoal(userId, planId, goal).catch(() => false);
    }, debounceMs);
  }, [hydrationReady, activePlanId, userId, goalKey, planGoalKey, ownerPlanId, debounceMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
}
