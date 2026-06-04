import { describe, expect, it } from "@jest/globals";
import { analyzeWeek, resolveWeekDisplayRunKm } from "./weeklyAnalysis";
import type { PlanWeek } from "./marathonPrediction";
import type { StoredHealthRun } from "./healthRuns";
import { sumRunBikeTotalKmFromHealthInRange } from "./runCyclingDistanceSeparation";

describe("runCyclingDistanceSeparation (health sums)", () => {
  it("10 km run + 60 km bike in window → runKm=10, bikeKm=60, total=70 (Step 7 numbers)", () => {
    const run: StoredHealthRun = {
      runId: "a",
      startDate: "2026-06-10T10:00:00.000Z",
      duration: 1800,
      distanceMeters: 10_000,
      distanceUnknown: false,
      workoutType: "running",
    };
    const bike: StoredHealthRun = {
      runId: "b",
      startDate: "2026-06-11T10:00:00.000Z",
      duration: 7200,
      distanceMeters: 60_000,
      distanceUnknown: false,
      workoutType: "cycling",
    };
    const { runKm, bikeKm, totalKm } = sumRunBikeTotalKmFromHealthInRange(
      [run, bike],
      new Date("2026-06-09T00:00:00.000Z").getTime(),
      new Date("2026-06-11T23:59:59.999Z").getTime(),
    );
    expect(runKm).toBe(10);
    expect(bikeKm).toBe(60);
    expect(totalKm).toBe(70);
  });
});

describe("run vs bike weekly separation (analyzeWeek)", () => {
  it("10 km easy + 60 km bike plan session: running Ist=10, bike=60, total=70 (Step 7)", () => {
    const week: PlanWeek = {
      wn: 1,
      phase: "BASE",
      label: "T",
      km: 10,
      s: [
        {
          id: "e1",
          day: "Mi",
          date: "10. Jun",
          type: "easy",
          title: "Easy 10k",
          km: 10,
        },
        {
          id: "b1",
          day: "Do",
          date: "11. Jun",
          type: "bike",
          title: "Rad",
          km: 0,
        },
      ],
    };
    const runUuid = "run-uuid";
    const bikeUuid = "bike-uuid";
    const runH: StoredHealthRun = {
      runId: runUuid,
      startDate: "2026-06-10T10:00:00.000Z",
      duration: 3600,
      distanceMeters: 10_000,
      distanceUnknown: false,
      workoutType: "running",
      platformId: "p1",
    };
    const bikeH: StoredHealthRun = {
      runId: bikeUuid,
      startDate: "2026-06-11T10:00:00.000Z",
      duration: 7200,
      distanceMeters: 60_000,
      distanceUnknown: false,
      workoutType: "cycling",
      platformId: "p2",
    };
    const healthById = new Map<string, StoredHealthRun>([
      [runUuid, runH],
      [bikeUuid, bikeH],
    ]);
    const logs = {
      e1: {
        done: true,
        at: "2026-06-10T12:00:00.000Z",
        assignedRun: { runId: runUuid, startDate: runH.startDate, duration: 3600, distanceKm: 10 },
      },
      b1: {
        done: true,
        at: "2026-06-11T12:00:00.000Z",
        assignedRun: { runId: bikeUuid, startDate: bikeH.startDate, duration: 7200, distanceKm: 60 },
      },
    };

    const a = analyzeWeek(week, logs, new Date("2026-06-15T12:00:00.000Z"), healthById);
    expect(a.actualKm).toBe(10);
    expect(a.actualBikeSessionKm).toBe(60);
    expect(a.actualTotalTrainingKm).toBe(70);
  });

  it("cycling mis-assigned to easy run counts 0 in running actualKm with healthById", () => {
    const week: PlanWeek = {
      wn: 2,
      phase: "BASE",
      label: "T2",
      km: 10,
      s: [
        {
          id: "e2",
          day: "Fr",
          date: "12. Jun",
          type: "easy",
          title: "Easy",
          km: 10,
        },
      ],
    };
    const bike: StoredHealthRun = {
      runId: "bike-only",
      startDate: "2026-06-12T08:00:00.000Z",
      duration: 3600,
      distanceMeters: 50_000,
      distanceUnknown: false,
      workoutType: "cycling",
      platformId: "p-bike",
    };
    const logs = {
      e2: {
        done: true,
        at: "2026-06-12T10:00:00.000Z",
        assignedRun: { runId: "bike-only", startDate: bike.startDate, duration: 3600, distanceKm: 50 },
      },
    };
    const healthById = new Map<string, StoredHealthRun>([["bike-only", bike]]);
    const a = analyzeWeek(week, logs, new Date("2026-06-15T12:00:00.000Z"), healthById);
    expect(a.actualKm).toBe(0);
  });
});

describe("resolveWeekDisplayRunKm", () => {
  it("nutzt Health-Daten wenn vorhanden (> 0)", () => {
    expect(resolveWeekDisplayRunKm(12.5, 10.0)).toBe(12.5);
  });

  it("fällt auf session_logs-Km zurück wenn Health = 0 (ältere Wochen)", () => {
    expect(resolveWeekDisplayRunKm(0, 10.3)).toBe(10.3);
  });
});
