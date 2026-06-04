import { renderHook } from "@testing-library/react";
import type { PlanWeek, SessionLog } from "../../marathonPrediction";
import type { TrainingPlanV2 } from "../../planV2/types";
import type { PersistedAiPlanPatches, PersistedMarathonLogs } from "./runtimePersistenceTypes";
import {
  APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER,
  useAppCorePersistenceEffects,
} from "./useAppCorePersistenceEffects";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "../../persistence/marathonLocalStorageKeys";
import { HEALTH_RUNS_STORAGE_KEY } from "../../healthRuns";
import { RECOVERY_DAILY_STORAGE_KEY } from "../../recovery/recoveryStorage";
import { buildTrainingPlanV2FromBasePlan } from "../../planV2/fromBasePlan";

describe("useAppCorePersistenceEffects", () => {
  const tinyBasePlan: PlanWeek[] = [
    {
      wn: 1,
      phase: "BASE",
      label: "T",
      dates: "",
      km: 10,
      focus: "",
      s: [
        {
          id: "w01-di",
          day: "Di",
          date: "1. Jan",
          type: "easy",
          title: "Easy",
          km: 10,
          desc: "",
          pace: null,
        },
      ],
    },
  ];

  const stablePatchesEmpty: PersistedAiPlanPatches = [] as const;

  it("exposes persisted core keys aligned with declaration order helper", () => {
    expect(APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER.length).toBe(6);
    expect(APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER.slice(0, 4)).toEqual([
      MARATHON_LOGS_KEY,
      MARATHON_PREFERENCES_KEY,
      MARATHON_AI_PLAN_PATCHES_KEY,
      TRAINING_PLAN_V2_STORAGE_KEY,
    ]);
    expect(APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER.slice(4)).toEqual([
      HEALTH_RUNS_STORAGE_KEY,
      RECOVERY_DAILY_STORAGE_KEY,
    ]);
  });

  it("writes slices in canonical key order after sequential rerenders", () => {
    const order: string[] = [];
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => {
      void v;
      order.push(String(k));
      return undefined;
    });

    const validPlan = buildTrainingPlanV2FromBasePlan(tinyBasePlan);
    const stablePreferences = { targetTime: "x" };
    const stableRuns: unknown[] = [];
    const stableRecovery: unknown[] = [];

    const { rerender } = renderHook(
      (props: {
        logs: PersistedMarathonLogs;
        preferences: { targetTime?: string };
        plan: TrainingPlanV2;
        runs: unknown[];
        recovery: unknown[];
      }) => {
        useAppCorePersistenceEffects({
          logs: props.logs,
          preferences: props.preferences,
          aiPlanPatches: stablePatchesEmpty,
          trainingPlanV2: props.plan,
          healthRuns: props.runs as never,
          recoveryDailyRows: props.recovery as never,
        });
      },
      {
        initialProps: {
          logs: { a: { done: false } satisfies SessionLog } as PersistedMarathonLogs,
          preferences: stablePreferences,
          plan: validPlan,
          runs: stableRuns,
          recovery: stableRecovery,
        },
      },
    );

    rerender({
      logs: { a: { done: true } satisfies SessionLog } as PersistedMarathonLogs,
      preferences: stablePreferences,
      plan: validPlan,
      runs: stableRuns,
      recovery: stableRecovery,
    });

    expect(order).toEqual([
      MARATHON_LOGS_KEY,
      MARATHON_PREFERENCES_KEY,
      MARATHON_AI_PLAN_PATCHES_KEY,
      TRAINING_PLAN_V2_STORAGE_KEY,
      HEALTH_RUNS_STORAGE_KEY,
      RECOVERY_DAILY_STORAGE_KEY,
      MARATHON_LOGS_KEY,
    ]);

    setItem.mockRestore();
  });

  it("does not issue further localStorage writes when all slice identities stay stable across rerenders", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);

    const validPlan = buildTrainingPlanV2FromBasePlan(tinyBasePlan);
    const stableSlices = {
      logs: { session: {} satisfies SessionLog } as PersistedMarathonLogs,
      preferences: { targetTime: "3:30:00" },
      aiPlanPatches: stablePatchesEmpty,
      trainingPlanV2: validPlan,
      healthRuns: [] as const,
      recoveryDailyRows: [] as const,
    };

    const { rerender } = renderHook(() => useAppCorePersistenceEffects(stableSlices));
    const afterMount = setItem.mock.calls.length;
    rerender();
    rerender();

    expect(setItem.mock.calls.length).toBe(afterMount);
    expect(afterMount).toBe(APP_CORE_LOCALSTORAGE_WRITE_KEYS_IN_EFFECT_ORDER.length);

    setItem.mockRestore();
  });
});
