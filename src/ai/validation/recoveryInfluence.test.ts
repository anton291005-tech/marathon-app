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

describe("probabilistic recovery influence (swap decision layer)", () => {
  // Non-zone2-equivalent swap to ensure the decision layer runs.
  const a: WorkoutV2 = { id: "a", dateIso: new Date("2026-05-01T12:00:00.000Z").toISOString(), sport: "run", sessionType: "interval", title: "A", km: 10 };
  const b: WorkoutV2 = { id: "b", dateIso: new Date("2026-05-03T12:00:00.000Z").toISOString(), sport: "run", sessionType: "easy", title: "B", km: 10 };

  const before = planWith([a, b]);
  const after = planWith([b, a]);

  test("same recovery, different confidence => different adaptation strength", () => {
    const hi = validateSwap({ source: a, target: b, before, after, validationContext: ctxWithRecovery({ avgRecovery: 30, avgConfidence: 1.0 }) });
    const lo = validateSwap({ source: a, target: b, before, after, validationContext: ctxWithRecovery({ avgRecovery: 30, avgConfidence: 0.1 }) });
    expect((hi.axes.recovery?.score ?? 0)).toBeGreaterThan((lo.axes.recovery?.score ?? 0));
  });

  test("low confidence still affects decision (not zeroed out)", () => {
    const low = validateSwap({ source: a, target: b, before, after, validationContext: ctxWithRecovery({ avgRecovery: 30, avgConfidence: 0.0 }) });
    expect((low.axes.recovery?.score ?? 0)).toBeGreaterThan(35); // baseline is ~35; fatigued should still push higher
  });

  test("high confidence amplifies plan adjustments", () => {
    const hi = validateSwap({ source: a, target: b, before, after, validationContext: ctxWithRecovery({ avgRecovery: 30, avgConfidence: 1.0 }) });
    expect((hi.axes.recovery?.score ?? 0)).toBeGreaterThanOrEqual(50);
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

