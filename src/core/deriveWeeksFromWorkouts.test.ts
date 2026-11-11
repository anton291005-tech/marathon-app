import { deriveWeeksFromWorkouts } from "./deriveWeeksFromWorkouts";
import type { WorkoutV2 } from "../planV2/types";

// `dateIso` trägt den Kalendertag als UTC-Mittag (wie der Plan-Kern); month ist 0-basiert wie bei `Date`.
// Lokale Zeit (`new Date(y, m, d, 12)`) würde den Tag ab UTC+13 in den Vortag schieben.
const utcNoon = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day, 12)).toISOString();

describe("deriveWeeksFromWorkouts", () => {
  test("groups by Monday week start and sums km", () => {
    const workouts: WorkoutV2[] = [
      { id: "a", dateIso: utcNoon(2026, 3, 30), sport: "run", sessionType: "easy", title: "Easy", km: 10 },
      { id: "b", dateIso: utcNoon(2026, 4, 1), sport: "bike", sessionType: "bike", title: "Bike", km: 0 },
      { id: "c", dateIso: utcNoon(2026, 4, 7), sport: "run", sessionType: "interval", title: "Intervals", km: 12 },
    ];
    const weeks = deriveWeeksFromWorkouts(workouts);
    expect(weeks.length).toBe(2);
    expect(weeks[0].totalKm).toBe(10);
    expect(weeks[1].totalKm).toBe(12);
    // 30 Apr 2026 is Thursday => week start Monday 27 Apr
    expect(weeks[0].startIso).toBe("2026-04-27");
    expect(weeks[1].startIso).toBe("2026-05-04");
  });

  test("rundet die Wochensumme auf 0,1 km (kein Gleitkomma-Rauschen)", () => {
    const at = (day: number) => utcNoon(2027, 2, day);
    const workouts: WorkoutV2[] = [
      { id: "a", dateIso: at(8), sport: "run", sessionType: "easy", title: "E", km: 7.3 },
      { id: "b", dateIso: at(10), sport: "run", sessionType: "tempo", title: "T", km: 10.2 },
      { id: "c", dateIso: at(12), sport: "run", sessionType: "easy", title: "E", km: 20.1 },
      { id: "d", dateIso: at(14), sport: "run", sessionType: "race", title: "Rennen", km: 42.2 },
    ];
    expect(7.3 + 10.2 + 20.1 + 42.2).toBe(79.80000000000001);
    expect(deriveWeeksFromWorkouts(workouts)[0].totalKm).toBe(79.8);
  });
});
