import { deriveWeeksFromWorkouts } from "./deriveWeeksFromWorkouts";
import type { WorkoutV2 } from "../planV2/types";

describe("deriveWeeksFromWorkouts", () => {
  test("groups by Monday week start and sums km", () => {
    const workouts: WorkoutV2[] = [
      { id: "a", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 10 },
      { id: "b", dateIso: new Date(2026, 4, 1, 12, 0, 0).toISOString(), sport: "bike", sessionType: "bike", title: "Bike", km: 0 },
      { id: "c", dateIso: new Date(2026, 4, 7, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Intervals", km: 12 },
    ];
    const weeks = deriveWeeksFromWorkouts(workouts);
    expect(weeks.length).toBe(2);
    expect(weeks[0].totalKm).toBe(10);
    expect(weeks[1].totalKm).toBe(12);
    // 30 Apr 2026 is Thursday => week start Monday 27 Apr
    expect(weeks[0].startIso).toBe("2026-04-27");
    expect(weeks[1].startIso).toBe("2026-05-04");
  });
});

