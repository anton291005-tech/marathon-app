import type { PlanWeek } from "../marathonPrediction";
import { buildTrainingPlanV2FromBasePlan } from "../planV2/fromBasePlan";
import { assertDisplayPlanInvariants } from "./assertDisplayPlanInvariants";

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

describe("assertDisplayPlanInvariants", () => {
  const v2 = buildTrainingPlanV2FromBasePlan(tinyBasePlan);

  it("accepts valid plan + patches", () => {
    expect(assertDisplayPlanInvariants(v2, [{ sessionId: "w01-di", changes: { km: 8 } }])).toEqual({ ok: true });
  });

  it("rejects broken V2", () => {
    const bad = { ...v2, workouts: [] };
    expect(assertDisplayPlanInvariants(bad as any, [])).toMatchObject({ ok: false, reason: "trainingPlanV2_invalid" });
  });
});
