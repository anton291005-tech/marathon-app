import { useEffect, useRef } from "react";
import { validateTrainingPlanV2Integrity } from "../../ai/validation/validateTrainingPlanV2Integrity";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { HEALTH_RUNS_STORAGE_KEY } from "../../healthRuns";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "../../persistence/marathonLocalStorageKeys";
import { RECOVERY_DAILY_STORAGE_KEY } from "../../recovery/recoveryStorage";
import { warnOnce } from "../../ui/productionGuards";

import type { AppCorePersistenceSlices } from "./runtimePersistenceTypes";

export type { AppCorePersistenceSlices } from "./runtimePersistenceTypes";

/**
 * Canonical order of **`localStorage` keys** guarded by successive `useEffect` registrations in this hook.
 * **Not identical** with physical write timelines (each slice listens independently); it IS the coupling
 * contract for regressions/tests and must match `KNOWN_MY_RACE_STORAGE_KEYS` subsets where overlapping.
 *
 * Effects run in **declaration order**: logs → prefs → patches → training v2 → health runs → recovery daily.
 *
 * Referential coupling (important — no deep-equality shortcuts):
 * - Each effect reruns whenever **its slice’s identity** (`===`) changes — even when `JSON.stringify` would be unchanged.
 * - Passing freshly allocated objects/array wrappers from render will schedule extra writes (+ perf churn).
 *
 * Stable-by-value updates should keep the same top-level references (mutate/copy-on-write consciously), or callers
 * must accept additional writes intentionally.
 *
 * Integrity gate:
 * - `trainingPlanV2` persists only after `validateTrainingPlanV2Integrity` — malformed structures skip the write silently.
 *
 * Exceptions / quota paths:
 * - training plan vs healthRuns vs recovery try/catch with ignore — logs/prefs/set patches always attempt write.
 */

export const APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER = [
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  MARATHON_AI_PLAN_PATCHES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
  HEALTH_RUNS_STORAGE_KEY,
  RECOVERY_DAILY_STORAGE_KEY,
] as const;

export function useAppCorePersistenceEffects(slices: AppCorePersistenceSlices): void {
  const { logs, preferences, aiPlanPatches, trainingPlanV2, healthRuns, recoveryDailyRows } = slices;

  const preferencesLogicalRef = useRef<{ identity: unknown; serialized: string } | null>(null);

  useEffect(() => {
    localStorage.setItem(MARATHON_LOGS_KEY, JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      try {
        const serialized = JSON.stringify(preferences);
        const prev = preferencesLogicalRef.current;
        if (
          prev &&
          prev.identity !== preferences &&
          serialized === prev.serialized &&
          serialized !== ""
        ) {
          warnOnce("persistence_prefs_reidentity_same_json", {
            hint:
              "preferences object identity changed while JSON serialization stayed identical — harmless but may cause redundant localStorage writes",
          });
        }
        preferencesLogicalRef.current = { identity: preferences, serialized };
      } catch {
        preferencesLogicalRef.current = { identity: preferences, serialized: "" };
      }
    }
    localStorage.setItem(MARATHON_PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(MARATHON_AI_PLAN_PATCHES_KEY, JSON.stringify(aiPlanPatches));
  }, [aiPlanPatches]);

  useEffect(() => {
    try {
      const normalized = normalizeTrainingPlan(trainingPlanV2);
      if (!validateTrainingPlanV2Integrity(normalized)) return;
      localStorage.setItem(TRAINING_PLAN_V2_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore quota errors
    }
  }, [trainingPlanV2]);

  useEffect(() => {
    try {
      localStorage.setItem(HEALTH_RUNS_STORAGE_KEY, JSON.stringify(healthRuns));
    } catch {
      // ignore quota errors
    }
  }, [healthRuns]);

  useEffect(() => {
    try {
      localStorage.setItem(RECOVERY_DAILY_STORAGE_KEY, JSON.stringify(recoveryDailyRows));
    } catch {
      // ignore quota errors
    }
  }, [recoveryDailyRows]);
}
