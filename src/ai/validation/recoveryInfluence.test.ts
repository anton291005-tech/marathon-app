import type { TrainingPlanV2, WorkoutV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { validateSwap } from "./validateSwap";
import { buildValidationContext } from "./buildValidationContext";
import type { ValidationContext } from "./validationContext";

function planWith(workouts: TrainingPlanV2["workouts"]): TrainingPlanV2 {
  return rebuildPlanFromWorkouts({ workouts });
}

function ctxWithRecovery(args: { avgRecovery: number; avgConfidence: number }): ValidationContext {
  const influenceWeight = 0.3 + 0.7 * args.avgConfidence;
  return {
    planGoal: "marathon",
    currentWeekLoad: 55,
    weeklyAvgLoad: 55,
    recoverySummary: {
      avgRecovery: args.avgRecovery,
      avgConfidence: args.avgConfidence,
      influenceWeight,
      adjustedRecoveryInfluence: args.avgRecovery * influenceWeight,
      recoveryStatus: args.avgRecovery >= 75 ? "fresh" : args.avgRecovery >= 45 ? "normal" : "fatigued",
    },
    phase: "build",
  };
}

describe("recovery context (Recovery-Achse im Swap entfallen, Spec §15.5 (3))", () => {
  const a: WorkoutV2 = { id: "a", dateIso: new Date("2026-05-01T12:00:00.000Z").toISOString(), sport: "run", sessionType: "interval", title: "A", km: 10 };
  const b: WorkoutV2 = { id: "b", dateIso: new Date("2026-05-03T12:00:00.000Z").toISOString(), sport: "run", sessionType: "easy", title: "B", km: 10 };

  const before = planWith([a, b]);
  const after = planWith([b, a]);

  test("validateSwap liefert keine Recovery-Achse mehr, auch bei starker Ermüdung", () => {
    const res = validateSwap({ source: a, target: b, before, after, validationContext: ctxWithRecovery({ avgRecovery: 20, avgConfidence: 1.0 }) });
    expect(res.axes.recovery).toBeUndefined();
  });

  test("buildValidationContext never produces undefined recovery flow", () => {
    const v = buildValidationContext({
      before,
      after,
      targetWorkout: a,
      recoveryScore0_100: 42,
      recoveryConfidence: 0.1,
    });
    expect(v.recoverySummary).toBeTruthy();
    expect(typeof v.recoverySummary.adjustedRecoveryInfluence).toBe("number");
    expect(v.recoverySummary.recoveryStatus).toMatch(/fresh|normal|fatigued/);
  });
});

