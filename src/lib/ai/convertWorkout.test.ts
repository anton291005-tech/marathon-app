import type { WorkoutV2 } from "../../planV2/types";
import { convertWorkoutToRun, __testingExports } from "./convertWorkout";

function w(partial: Partial<WorkoutV2> & Pick<WorkoutV2, "id">): WorkoutV2 {
  return {
    id: partial.id,
    dateIso: partial.dateIso ?? "2026-05-15T12:00:00.000",
    sport: partial.sport ?? "bike",
    sessionType: partial.sessionType ?? "bike",
    title: partial.title ?? "Rennrad",
    km: partial.km ?? 0,
    desc: partial.desc ?? null,
    pace: partial.pace ?? null,
    intensity: partial.intensity,
  };
}

describe("convertWorkout", () => {
  test("bike 50 km medium → tempo run ~18 km", () => {
    const result = convertWorkoutToRun(
      w({
        id: "b1",
        km: 50,
        intensity: "medium",
        title: "Rennrad medium",
      }),
    );
    expect(result.proposed.sessionType).toBe("tempo");
    expect(result.proposed.km).toBeGreaterThanOrEqual(15);
    expect(result.proposed.km).toBeLessThanOrEqual(20);
    expect(result.proposed.sport).toBe("run");
    expect(result.originalSummary).toMatch(/medium/);
  });

  test("bike 80 km high → interval (capped at 30 km), not long run", () => {
    const result = convertWorkoutToRun(
      w({
        id: "b2",
        km: 80,
        intensity: "high",
        title: "Langer Rad-Tag",
      }),
    );
    expect(result.proposed.sessionType).toBe("interval");
    expect(result.proposed.sessionType).not.toBe("long");
    expect(result.proposed.km).toBeGreaterThanOrEqual(25);
    expect(result.proposed.km).toBeLessThanOrEqual(30);
  });

  test("bike 20 km easy → short easy run", () => {
    const result = convertWorkoutToRun(
      w({
        id: "b3",
        km: 20,
        intensity: "low",
        title: "Rennrad easy",
      }),
    );
    expect(result.proposed.sessionType).toBe("easy");
    expect(result.proposed.km).toBeGreaterThanOrEqual(5);
    expect(result.proposed.km).toBeLessThanOrEqual(10);
  });

  test("km = 0 and missing intensity → 60 min easy fallback", () => {
    const { DEFAULT_BIKE_DURATION_MIN, RUN_PACE_MIN_PER_KM } = __testingExports();
    const result = convertWorkoutToRun(
      w({
        id: "b4",
        km: 0,
        title: "Rennrad optional",
        desc: "Zone 2",
      }),
    );
    const expectedKm = Math.round((DEFAULT_BIKE_DURATION_MIN / RUN_PACE_MIN_PER_KM.easy) * 10) / 10;
    expect(result.proposed.sessionType).toBe("easy");
    expect(result.proposed.km).toBe(expectedKm);
    expect(result.originalSummary).toMatch(/60 min/);
  });

  test("duration from title when km is zero", () => {
    const { RUN_PACE_MIN_PER_KM } = __testingExports();
    const result = convertWorkoutToRun(
      w({
        id: "b5",
        km: 0,
        title: "Rennrad 90 min",
        intensity: "medium",
      }),
    );
    expect(result.proposed.sessionType).toBe("tempo");
    const rawKm = 90 / RUN_PACE_MIN_PER_KM.tempo;
    const expectedKm = Math.round(Math.max(5, Math.min(30, rawKm)) * 10) / 10;
    expect(result.proposed.km).toBe(expectedKm);
  });
});

describe("convertWorkout rule registry", () => {
  test("rejects non-bike workout", () => {
    expect(() =>
      convertWorkoutToRun(
        w({
          id: "r1",
          sport: "run",
          sessionType: "easy",
          km: 10,
        }),
      ),
    ).toThrow(/Bike/);
  });
});
