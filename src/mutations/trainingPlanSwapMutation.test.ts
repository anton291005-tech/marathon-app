import type { PlanWeek } from "../marathonPrediction";
import { buildTrainingPlanV2FromBasePlan } from "../planV2/fromBasePlan";
import { trySwapWorkoutDatesInPlan } from "./trainingPlanSwapMutation";

const twoSessionPlan: PlanWeek[] = [
  {
    wn: 1,
    phase: "BASE",
    label: "T",
    dates: "",
    km: 20,
    focus: "",
    s: [
      { id: "a", day: "Di", date: "1. Jan", type: "easy", title: "A", km: 5, desc: "", pace: null },
      { id: "b", day: "Mi", date: "2. Jan", type: "easy", title: "B", km: 5, desc: "", pace: null },
    ],
  },
];

describe("trySwapWorkoutDatesInPlan", () => {
  it("noop for same id", () => {
    const v2 = buildTrainingPlanV2FromBasePlan(twoSessionPlan);
    expect(trySwapWorkoutDatesInPlan(v2, "a", "a")).toEqual({ ok: false, reason: "noop" });
  });

  it("fails missing id", () => {
    const v2 = buildTrainingPlanV2FromBasePlan(twoSessionPlan);
    expect(trySwapWorkoutDatesInPlan(v2, "a", "zzz").ok).toBe(false);
    expect(trySwapWorkoutDatesInPlan(v2, "a", "zzz")).toMatchObject({ reason: "missing_ids" });
  });

  it("deterministic swap: same inputs -> same date map fingerprint", () => {
    const v2 = buildTrainingPlanV2FromBasePlan(twoSessionPlan);
    const r1 = trySwapWorkoutDatesInPlan(v2, "a", "b");
    const r2 = trySwapWorkoutDatesInPlan(v2, "a", "b");
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const fp = (p: typeof r1.after) =>
        p.workouts
          .map((w) => `${w.id}|${w.dateIso.slice(0, 10)}`)
          .sort()
          .join(";");
      expect(fp(r1.after)).toBe(fp(r2.after));
    }
  });
});
