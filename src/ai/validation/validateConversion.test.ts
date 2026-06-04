import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import type { TrainingPlanV2, WorkoutV2 } from "../../planV2/types";
import {
  applyConversionToPlan,
  buildConversionAthleteFacingWarnings,
  computeConversionPriorWeekWarnings,
  validateConversion,
} from "./validateConversion";

function workout(partial: Partial<WorkoutV2> & Pick<WorkoutV2, "id" | "dateIso">): WorkoutV2 {
  return {
    sport: partial.sport ?? "run",
    sessionType: partial.sessionType ?? "easy",
    title: partial.title ?? "Run",
    km: partial.km ?? 0,
    desc: partial.desc ?? null,
    pace: partial.pace ?? null,
    intensity: partial.intensity,
    ...partial,
  };
}

function planWith(workouts: WorkoutV2[]): TrainingPlanV2 {
  return rebuildPlanFromWorkouts({ workouts });
}

describe("validateConversion", () => {
  test("warns when converted week running km exceeds 120% of prior week", () => {
    const before = planWith([
      workout({ id: "w1", dateIso: "2026-05-05T12:00:00.000", sessionType: "easy", km: 20 }),
      workout({ id: "bike", dateIso: "2026-05-12T12:00:00.000", sport: "bike", sessionType: "bike", km: 0, title: "Rad" }),
    ]);

    const after = applyConversionToPlan(before, "bike", {
      sport: "run",
      sessionType: "interval",
      km: 28,
      title: "Intervall",
    });

    const prior = computeConversionPriorWeekWarnings(before, after, "bike", 1.2);
    expect(prior.length).toBeGreaterThan(0);
    expect(prior[0]?.ratio).toBeGreaterThan(1.2);

    const validation = validateConversion(before, after, "bike");
    expect(validation.status).toBe("warn");
    expect(validation.axes.load?.reason).toMatch(/Vorwoche|Lauf-km/i);
  });

  test("buildConversionAthleteFacingWarnings reports running km shift", () => {
    const before = planWith([
      workout({ id: "bike", dateIso: "2026-05-12T12:00:00.000", sport: "bike", sessionType: "bike", km: 50, title: "Rad" }),
      workout({ id: "e1", dateIso: "2026-05-13T12:00:00.000", sessionType: "easy", km: 10 }),
    ]);
    const after = applyConversionToPlan(before, "bike", {
      sport: "run",
      sessionType: "tempo",
      km: 18,
      title: "Tempo",
    });
    const warnings = buildConversionAthleteFacingWarnings(before, after, "bike");
    expect(warnings.some((w) => w.includes("Wochen-Lauf-km"))).toBe(true);
  });

  test("never blocks conversion", () => {
    const before = planWith([
      workout({ id: "w0", dateIso: "2026-05-04T12:00:00.000", sessionType: "easy", km: 10 }),
      workout({ id: "bike", dateIso: "2026-05-11T12:00:00.000", sport: "bike", sessionType: "bike", km: 80, title: "Rad" }),
    ]);
    const after = applyConversionToPlan(before, "bike", {
      sport: "run",
      sessionType: "interval",
      km: 30,
      title: "Intervall",
    });
    const validation = validateConversion(before, after, "bike");
    expect(validation.status).not.toBe("block");
  });
});
