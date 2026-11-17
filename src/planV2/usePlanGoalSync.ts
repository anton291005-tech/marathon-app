import { useCallback, useEffect, useRef } from "react";
import { updateTrainingPlanGoalMeta, type PlanGoalWriteMode } from "../lib/supabase/services/trainingPlanService";
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
  saveGoal?: (userId: string, planId: string, goal: PlanGoalMetaV2, mode: PlanGoalWriteMode) => Promise<boolean>;
  debounceMs?: number;
};

/**
 * Zielzeit am Plan halten (`meta.goal`):
 * 1. Lesen: Ist der Besitzer der lokalen Preferences unbekannt (frisches Gerät, Konto davor gewechselt) und trägt der
 *    aktive Plan ein Ziel, gilt das Ziel des Plans — nicht die nutzerweite Profil-Zielzeit. Einmal je aktivem Plan.
 *    Gehören die Preferences einem anderen Plan, wird nichts übernommen (Planwechsel läuft über `switchPlanPreferences`).
 * 2. Schreiben nur in zwei Fällen: `meta.goal` fehlt (Nachtrag für Altpläne, sobald die Preferences zum Plan gehören)
 *    oder die Zielzeit wurde in dieser Sitzung wirklich eingegeben (`noteGoalInput`). Eine veraltete lokale Zielzeit
 *    überschreibt beim Öffnen nie ein vorhandenes `meta.goal`.
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
}: Args): { noteGoalInput: () => void } {
  const appliedForRef = useRef<string | null>(null);
  /** Plan, dessen Ziel in dieser Sitzung eingegeben wurde. */
  const editedForRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef(activePlanId);
  activeIdRef.current = activePlanId;
  const latest = useRef({ plan, preferencesGoal, ownerPlanId, applyGoalToPreferences, claimOwner, setPlan, saveGoal });
  latest.current = { plan, preferencesGoal, ownerPlanId, applyGoalToPreferences, claimOwner, setPlan, saveGoal };

  const goalKey = preferencesGoal ? `${preferencesGoal.raceGoal}|${preferencesGoal.targetTime ?? ""}` : "";
  const planGoal = readPlanGoalMeta(plan);
  const planGoalKey = planGoal ? `${planGoal.raceGoal}|${planGoal.targetTime ?? ""}` : "";

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const noteGoalInput = useCallback(() => {
    editedForRef.current = activeIdRef.current;
  }, []);

  useEffect(() => {
    if (!hydrationReady || !activePlanId || !userId) return;
    const cur = latest.current;
    const metaGoal = readPlanGoalMeta(cur.plan);
    if (appliedForRef.current !== activePlanId) {
      appliedForRef.current = activePlanId;
      if (metaGoal) {
        if (cur.ownerPlanId == null) {
          cur.applyGoalToPreferences(metaGoal);
          cur.claimOwner(activePlanId);
        }
        cancel();
        return;
      }
    }
    const goal = cur.preferencesGoal;
    const mode: PlanGoalWriteMode | null = !metaGoal ? "backfill" : editedForRef.current === activePlanId ? "edit" : null;
    if (!goal || !mode || samePlanGoal(metaGoal, goal)) {
      cancel();
      return;
    }
    cancel();
    const planId = activePlanId;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (activeIdRef.current !== planId) return;
      latest.current.setPlan((prev) => withPlanGoalMeta(prev, goal));
      void latest.current.saveGoal(userId, planId, goal, mode).catch(() => false);
    }, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Werte über `latest`, Auslöser sind die Schlüssel
  }, [hydrationReady, activePlanId, userId, goalKey, planGoalKey, ownerPlanId, debounceMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { noteGoalInput };
}
