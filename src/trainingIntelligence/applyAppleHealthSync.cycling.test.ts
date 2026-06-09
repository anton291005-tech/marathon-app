import { freezeTimeForTests } from "../core/time/timeSystem";
import { applyAppleHealthTrainingSync } from "./applyAppleHealthSync";
import type { StoredHealthRun } from "../healthRuns";

describe("applyAppleHealthTrainingSync (cycling)", () => {
  beforeEach(() => {
    freezeTimeForTests(null);
  });

  test("cycling workout completes planned bike session same day (immediate)", () => {
    // Local calendar day = 2026-05-01
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions: any[] = [
      {
        id: "bike-1",
        type: "bike",
        title: "Rennrad",
        date: "1. Mai",
      },
    ];

    const healthRuns: StoredHealthRun[] = [
      {
        runId: "hk_bike",
        startDate: "2026-05-01T07:10:00.000Z",
        duration: 3600,
        distanceMeters: 35_000,
        distanceUnknown: false,
        workoutType: "cycling",
        sourceName: "Apple Health",
        avgHeartRateBpm: 135,
      },
    ];

    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: new Date("2026-05-01T12:00:00.000Z") });
    expect(res.changed).toBe(true);
    expect(res.logs["bike-1"]?.assignedRun?.runId).toBe("hk_bike");
    expect(res.logs["bike-1"]?.done).toBe(true);
    expect(typeof res.logs["bike-1"]?.at).toBe("string");
  });

  test("cycling does not get written into running sessions (no misclassification)", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    const planSessions: any[] = [
      { id: "run-1", type: "easy", title: "Easy", date: "1. Mai", km: 10, pace: "5:00/km" },
    ];
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_bike", startDate: "2026-05-01T07:10:00.000Z", duration: 3600, distanceMeters: 35_000, distanceUnknown: false, workoutType: "cycling", sourceName: "Apple Health" },
    ];
    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: new Date("2026-05-01T12:00:00.000Z") });
    expect(res.changed).toBe(false);
    expect(res.logs).toEqual({});
  });

  test("ambiguous cycling match (2 planned bike sessions same day) -> no auto-complete", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions: any[] = [
      { id: "bike-1", type: "bike", title: "Bike A", date: "1. Mai" },
      { id: "bike-2", type: "bike", title: "Bike B", date: "1. Mai" },
    ];

    const healthRuns: StoredHealthRun[] = [
      {
        runId: "hk_bike",
        startDate: "2026-05-01T07:10:00.000Z",
        duration: 3600,
        distanceMeters: 35_000,
        distanceUnknown: false,
        workoutType: "cycling",
        sourceName: "Apple Health",
      },
    ];

    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: new Date("2026-05-01T12:00:00.000Z") });
    expect(res.changed).toBe(false);
    expect(res.logs).toEqual({});
  });

  test("cycling does not auto-complete if planned bike session already completed", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));

    const planSessions: any[] = [{ id: "bike-1", type: "bike", title: "Bike", date: "1. Mai" }];
    const healthRuns: StoredHealthRun[] = [
      { runId: "hk_bike", startDate: "2026-05-01T07:10:00.000Z", duration: 3600, distanceMeters: 35_000, distanceUnknown: false, workoutType: "cycling", sourceName: "Apple Health" },
    ];
    const logs = {
      "bike-1": {
        done: true,
        at: "2026-05-01T09:00:00.000Z",
        assignedRun: { runId: "hk_bike", startDate: "2026-05-01T07:10:00.000Z", duration: 3600, distanceKm: 35 },
      },
    };

    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs, now: new Date("2026-05-01T12:00:00.000Z") });
    expect(res.changed).toBe(false);
    expect(res.logs).toBe(logs);
  });
});
