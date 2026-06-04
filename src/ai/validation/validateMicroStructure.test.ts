import type { TrainingPlanV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { validateMicroStructure } from "./validateMicroStructure";
import type { ValidationContext } from "./validationContext";

function planWith(workouts: TrainingPlanV2["workouts"]): TrainingPlanV2 {
  return rebuildPlanFromWorkouts({ workouts });
}

describe("validateMicroStructure", () => {
  const vctx: ValidationContext = {
    planGoal: "marathon",
    currentWeekLoad: 60,
    weeklyAvgLoad: 55,
    recoverySummary: {
      avgRecovery: 55,
      avgConfidence: 0.5,
      influenceWeight: 0.65,
      adjustedRecoveryInfluence: 35.75,
      recoveryStatus: "normal",
    },
    phase: "build",
  };

  test("interval + tempo on consecutive days emits warn", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "b", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 14 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect((res.axes.micro?.score ?? 0)).toBeGreaterThanOrEqual(90);
  });

  test("long run followed by next-day medium/high emits warn", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "b", dateIso: new Date(2026, 4, 1, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 12 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect((res.axes.micro?.score ?? 0)).toBeGreaterThanOrEqual(90);
  });

  test("valid spacing is allowed", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "r", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "rest", sessionType: "rest", title: "Rest", km: 0 },
      { id: "b", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 10 },
      { id: "c", dateIso: new Date(2026, 4, 2, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "d", dateIso: new Date(2026, 4, 4, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 8 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("allow");
  });
});

