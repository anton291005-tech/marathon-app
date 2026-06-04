import {
  assertCyclingInSelectionOrThrow,
  buildAssignedRunFromWorkout,
  buildSelectionOptionsFromHealthRuns,
  storedHealthRunToWorkout,
  selectionOptionsIncludeSameBikesAsStore,
  workoutLabelDeFromCanonical,
} from "./workoutSelectionModel";
import { getStoredHealthRunCanonicalType, type StoredHealthRun } from "../healthRuns";

function runW(partial: Partial<StoredHealthRun> & Pick<StoredHealthRun, "runId">): StoredHealthRun {
  return {
    startDate: partial.startDate ?? "2026-04-25T10:00:00.000Z",
    duration: partial.duration ?? 3600,
    distanceMeters: partial.distanceMeters ?? 10000,
    distanceUnknown: partial.distanceUnknown ?? false,
    workoutType: partial.workoutType ?? "running",
    ...partial,
  };
}

function bikeW(partial: Partial<StoredHealthRun> & Pick<StoredHealthRun, "runId">): StoredHealthRun {
  return runW({
    workoutType: "cycling",
    distanceMeters: 45000,
    ...partial,
  });
}

describe("workout selection (healthRuns-only, run + bike)", () => {
  test("headline label uses canonical only (bike → Rennrad, no Workout mapping)", () => {
    const w = bikeW({ runId: "x" });
    expect(workoutLabelDeFromCanonical(getStoredHealthRunCanonicalType(w))).toBe("Rennrad");
    const r = runW({ runId: "y" });
    expect(workoutLabelDeFromCanonical(getStoredHealthRunCanonicalType(r))).toBe("Lauf");
  });

  test("UI uses workoutSelectionModel output (bike in healthRuns → bike in options)", () => {
    const healthRuns: StoredHealthRun[] = [
      {
        runId: "1",
        startDate: "2026-04-27T08:00:00.000Z",
        duration: 3600,
        distanceMeters: 40000,
        distanceUnknown: false,
        workoutType: "cycling",
      },
    ];
    const options = buildSelectionOptionsFromHealthRuns(healthRuns);
    expect(options.some((o) => storedHealthRunToWorkout(o).type === "bike")).toBe(true);
  });

  test("cycling workout in healthRuns appears in selectionOptions (same types)", () => {
    const healthRuns = [runW({ runId: "a" }), bikeW({ runId: "b" })];
    const selectionOptions = buildSelectionOptionsFromHealthRuns(healthRuns);
    expect(selectionOptions).toEqual(
      expect.arrayContaining([expect.objectContaining({ runId: "b", workoutType: "cycling" })]),
    );
    const bikes = selectionOptions.map((r) => storedHealthRunToWorkout(r)).filter((w) => w.type === "bike");
    expect(bikes.length).toBeGreaterThan(0);
    expect(() => assertCyclingInSelectionOrThrow(healthRuns, selectionOptions)).not.toThrow();
  });

  test("selecting cycling → assignment payload has canonicalActivityType bike + workoutId", () => {
    const w = bikeW({ runId: "hk_bike1" });
    const ar = buildAssignedRunFromWorkout(w);
    expect(ar).toEqual(
      expect.objectContaining({
        workoutId: "hk_bike1",
        runId: "hk_bike1",
        canonicalActivityType: "bike",
      }),
    );
    expect(storedHealthRunToWorkout(w).type).toBe("bike");
  });

  test("running still maps to run and assignment type run", () => {
    const w = runW({ runId: "hk_run1", workoutType: "running" });
    const ar = buildAssignedRunFromWorkout(w);
    expect(ar.canonicalActivityType).toBe("run");
    expect(storedHealthRunToWorkout(w).type).toBe("run");
  });

  test("assert throws when store has bike but list dropped it", () => {
    const healthRuns = [bikeW({ runId: "b" })];
    const badList: StoredHealthRun[] = [];
    expect(() => assertCyclingInSelectionOrThrow(healthRuns, badList)).toThrow(
      "❌ CYCLING NOT IN SELECTION — SYSTEM BROKEN",
    );
  });

  test("midnight: assignment type comes from log, not re-derived from date", () => {
    const w = bikeW({ runId: "persist" });
    const fromWorkout = buildAssignedRunFromWorkout(w);
    const asPersisted = { ...fromWorkout } as { canonicalActivityType?: string; startDate: string };
    expect(asPersisted.canonicalActivityType).toBe("bike");
    expect(asPersisted.startDate).toBe(w.startDate);
  });

  test("selectionOptionsIncludeSameBikesAsStore is true when both have bike", () => {
    const hr = [bikeW({ runId: "x" })];
    const so = buildSelectionOptionsFromHealthRuns(hr);
    expect(selectionOptionsIncludeSameBikesAsStore(hr, so)).toBe(true);
  });
});
