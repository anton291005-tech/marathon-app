import { renderHook } from "@testing-library/react";
import { buildTrainingPlanV2FromBasePlan } from "../../planV2/fromBasePlan";
import type { PlanWeek } from "../../marathonPrediction";
import { deriveDisplayPlan } from "../../displayPlan/deriveDisplayPlan";
import { useDisplayPlanFromTrainingState } from "./useDisplayPlanFromTrainingState";

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

describe("useDisplayPlanFromTrainingState", () => {
  it("matches deriveDisplayPlan (parity with prior App inline useMemo)", () => {
    const v2 = buildTrainingPlanV2FromBasePlan(tinyBasePlan);
    const patches = [{ sessionId: "w01-di", changes: { km: 42 } }];
    const { result } = renderHook(() => useDisplayPlanFromTrainingState(v2, patches));
    expect(JSON.stringify(result.current)).toBe(JSON.stringify(deriveDisplayPlan(v2, patches)));
  });

  it("returns the same array reference across rerenders when inputs are unchanged (useMemo parity)", () => {
    const v2 = buildTrainingPlanV2FromBasePlan(tinyBasePlan);
    const patches = [{ sessionId: "w01-di", changes: { km: 42 } }] as const;
    const { result, rerender } = renderHook(() => useDisplayPlanFromTrainingState(v2, patches));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
