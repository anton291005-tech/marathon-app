import type { StoredHealthRun } from "../healthRuns";
import { normalizeAppleHealthRun } from "./normalizeAppleHealthRun";
import { isRunWorkout } from "./isRunWorkout";
import { storedHealthRunIsRunning } from "../healthRuns";

function storedWorkout(partial: Partial<StoredHealthRun> & { workoutType: string }): StoredHealthRun {
  return {
    runId: partial.runId ?? "id_1",
    startDate: partial.startDate ?? new Date("2026-01-01T10:00:00.000Z").toISOString(),
    duration: partial.duration ?? 3600,
    distanceMeters: partial.distanceMeters ?? 10000,
    distanceUnknown: partial.distanceUnknown ?? false,
    workoutType: partial.workoutType,
    sourceName: partial.sourceName,
    platformId: partial.platformId,
    avgHeartRateBpm: partial.avgHeartRateBpm,
  };
}

describe("normalizeAppleHealthRun type safety", () => {
  test("run workout → returns normalized run", () => {
    const run = storedWorkout({ workoutType: "running", distanceMeters: 5000, duration: 1500 });
    expect(storedHealthRunIsRunning(run)).toBe(true);
    const norm = normalizeAppleHealthRun(run);
    expect(isRunWorkout(norm)).toBe(true);
    if (!isRunWorkout(norm)) throw new Error("expected normalized run");
    expect(norm.type).toBe("run");
    expect(norm.distanceKm).toBeGreaterThan(0);
  });

  test("cycling workout → MUST NOT throw and MUST no-op", () => {
    const bike = storedWorkout({ workoutType: "cycling", distanceMeters: 20000, duration: 3600 });
    expect(storedHealthRunIsRunning(bike)).toBe(false);
    expect(() => normalizeAppleHealthRun(bike)).not.toThrow();
    const out = normalizeAppleHealthRun(bike);
    expect(out).toBe(bike);
    expect(isRunWorkout(out)).toBe(false);
  });
});

