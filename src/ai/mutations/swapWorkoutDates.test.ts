import type { TrainingPlanV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { swapWorkoutDates } from "./swapWorkoutDates";

describe("swapWorkoutDates (true cross-week move)", () => {
  test("swap across week boundaries shifts weekly totals", () => {
    const before: TrainingPlanV2 = rebuildPlanFromWorkouts({
      workouts: [
        {
          id: "a",
          dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), // week of 2026-04-27
          sport: "run",
          sessionType: "easy",
          title: "Easy",
          km: 10,
        },
        {
          id: "b",
          dateIso: new Date(2026, 4, 7, 12, 0, 0).toISOString(), // week of 2026-05-04
          sport: "run",
          sessionType: "interval",
          title: "Intervals",
          km: 12,
        },
      ],
    });

    const after = swapWorkoutDates(before, "a", "b");
    const byStart = new Map(after.weeks.map((w) => [w.startIso, w.totalKm] as const));
    // totals swapped across weeks
    expect(byStart.get("2026-04-27")).toBe(12);
    expect(byStart.get("2026-05-04")).toBe(10);
  });
});

