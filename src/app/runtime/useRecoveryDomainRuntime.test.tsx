jest.mock("../../core/time/timeSystem", () => ({
  getAppNow: () => new Date("2026-05-15T12:00:00.000Z"),
  getAppTodayYmd: () => "2026-05-15",
}));

import { act, renderHook } from "@testing-library/react";
import { deriveDisplayPlan } from "../../displayPlan/deriveDisplayPlan";
import type { PlanWeek } from "../../marathonPrediction";
import type { PermissionState } from "../../recovery/recoveryDisplayState";
import { buildTrainingPlanV2FromBasePlan } from "../../planV2/fromBasePlan";
import { useRecoveryDomainRuntime } from "./useRecoveryDomainRuntime";

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

const unknownPerms = (): { sleepPermission: PermissionState; hrvPermission: PermissionState; rhrPermission: PermissionState } => ({
  sleepPermission: "unknown",
  hrvPermission: "unknown",
  rhrPermission: "unknown",
});

describe("useRecoveryDomainRuntime", () => {
  it("still debounces committing recoveryInputVersion vs committedRecoveryVersion at 80ms", () => {
    jest.useFakeTimers();
    const trainingPlanV2 = buildTrainingPlanV2FromBasePlan(tinyBasePlan);
    const displayPlan = deriveDisplayPlan(trainingPlanV2, []);
    const base = {
      displayPlan,
      wIdx: 0,
      logs: {},
      recoveryDailyRows: [],
      aiPlanPatches: [],
      trainingPlanV2,
      ...unknownPerms(),
    };

    const { result, rerender } = renderHook((p: typeof base) => useRecoveryDomainRuntime(p), { initialProps: base });

    const initialCommitted = result.current.committedRecoveryVersion;
    expect(result.current.recoveryInputVersion).toBe(initialCommitted);

    rerender({
      ...base,
      logs: { "w01-di": { done: true } },
    });

    expect(result.current.recoveryInputVersion).not.toBe(initialCommitted);
    expect(result.current.committedRecoveryVersion).toBe(initialCommitted);

    act(() => {
      jest.advanceTimersByTime(79);
    });
    expect(result.current.committedRecoveryVersion).toBe(initialCommitted);

    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current.committedRecoveryVersion).toBe(result.current.recoveryInputVersion);
    jest.useRealTimers();
  });
});
