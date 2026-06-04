import { buildTodayAppleCoachLines } from "./todayPlanVsAppleRun";
import { appleHealthMissingCyclingDistance } from "./appleHealthPermissions";
import { classifyWorkoutType } from "./workoutTypeClassifier";
import {
  __setMergeHealthRunsDedupBypassForTests,
  isSameHealthRunWorkout,
  mergeHealthRuns,
  workoutToStored,
  type StoredHealthRun,
  getStoredHealthRunCanonicalType,
  storedHealthRunIsSyncedActivity,
} from "../healthRuns";
import type { PlanSession } from "../marathonPrediction";

function mkStored(
  partial: Partial<StoredHealthRun> & Pick<StoredHealthRun, "startDate" | "duration">,
): StoredHealthRun {
  const distanceUnknown =
    partial.distanceUnknown !== undefined
      ? partial.distanceUnknown
      : partial.distanceMeters == null || partial.distanceMeters === undefined;
  const distanceMeters = distanceUnknown ? null : (partial.distanceMeters as number);
  const platformId = partial.platformId ?? `pid-${partial.workoutType ?? "x"}-${partial.startDate}`;
  return {
    runId: partial.runId ?? `hk_${platformId}`,
    startDate: partial.startDate,
    duration: partial.duration,
    distanceMeters,
    distanceUnknown,
    workoutType: partial.workoutType,
    sourceName: partial.sourceName,
    platformId,
  };
}

describe("Apple Health workout sync (running + cycling)", () => {
  beforeAll(() => {
    __setMergeHealthRunsDedupBypassForTests(false);
  });

  test("cycling workouts are synced activities but not classified as running", () => {
    const c = mkStored({
      startDate: "2026-04-25T08:00:00.000Z",
      duration: 3600,
      distanceMeters: 35_000,
      distanceUnknown: false,
      workoutType: "cycling",
    });
    expect(storedHealthRunIsSyncedActivity(c)).toBe(true);
    expect(getStoredHealthRunCanonicalType(c)).toBe("bike");
  });

  test("mergeHealthRuns keeps both a run and a cycle from the same day (Test 3 mixed)", () => {
    const run = mkStored({
      startDate: "2026-04-25T07:00:00.000Z",
      duration: 2400,
      distanceMeters: 12_000,
      distanceUnknown: false,
      workoutType: "running",
      platformId: "mix-run",
    });
    const cycle = mkStored({
      startDate: "2026-04-25T10:00:00.000Z",
      duration: 1800,
      distanceMeters: 40_000,
      distanceUnknown: false,
      workoutType: "cycling",
      platformId: "mix-bike",
    });
    const merged = mergeHealthRuns([], [run, cycle]);
    expect(merged.map((r) => r.workoutType).sort()).toEqual(["cycling", "running"]);
  });

  test("mergeHealthRuns retains cycling with unknown distance (optional metrics)", () => {
    const cycle = mkStored({
      startDate: "2026-04-24T09:00:00.000Z",
      duration: 1200,
      distanceMeters: null,
      distanceUnknown: true,
      workoutType: "cycling",
      platformId: "nodist",
    });
    const merged = mergeHealthRuns([], [cycle]);
    expect(merged).toHaveLength(1);
    expect(merged[0].distanceUnknown).toBe(true);
    expect(merged[0].distanceMeters).toBeNull();
  });

  test("mergeHealthRuns does not duplicate the same platformId (Test 4 cold-start merge)", () => {
    const a = mkStored({
      startDate: "2026-04-23T11:00:00.000Z",
      duration: 1000,
      distanceMeters: 8000,
      distanceUnknown: false,
      workoutType: "cycling",
      platformId: "same-hk",
    });
    const again = { ...a, duration: 1000 };
    const merged = mergeHealthRuns([a], [again]);
    expect(merged.filter((r) => r.platformId === "same-hk")).toHaveLength(1);
  });

  test("duplicate workouts with different UUID → fuzzy deduped", () => {
    const runA = mkStored({
      startDate: "2026-04-25T08:00:00.000Z",
      duration: 3600,
      distanceMeters: 10_000,
      distanceUnknown: false,
      workoutType: "running",
      platformId: "uuid-a",
    });
    const runB = mkStored({
      startDate: "2026-04-25T08:00:30.000Z",
      duration: 3590,
      distanceMeters: 10_200,
      distanceUnknown: false,
      workoutType: "running",
      platformId: "uuid-b",
    });
    expect(isSameHealthRunWorkout(runA, runB)).toBe(true);
    const merged = mergeHealthRuns([], [runA, runB]);
    expect(merged).toHaveLength(1);
  });

  test("workoutToStored: cycling without totalDistance → distanceUnknown true", () => {
    const s = workoutToStored(
      {
        startDate: "2026-05-01T10:00:00.000Z",
        duration: 1800,
        workoutType: "cycling",
        platformId: "p1",
      },
      undefined,
    );
    expect(s.distanceUnknown).toBe(true);
    expect(s.distanceMeters).toBeNull();
  });

  test("classifier handles cycling-like unknown types", () => {
    expect(classifyWorkoutType("gravelCycling")).toBe("bike");
    expect(classifyWorkoutType("indoorCycling")).toBe("bike");
    expect(classifyWorkoutType("eBiking")).toBe("bike");
    expect(classifyWorkoutType("HKWorkoutActivityTypeCycling")).toBe("bike");
    expect(classifyWorkoutType("running")).toBe("run");
    expect(classifyWorkoutType("HKWorkoutActivityTypeRunning")).toBe("run");
    expect(classifyWorkoutType("crossCountrySkiing")).toBe("other");
    expect(classifyWorkoutType("swimming")).toBe("other");
    expect(classifyWorkoutType("")).toBe("other");
  });

  test("workoutToStored maps plugin laps array onto StoredHealthRun.laps", () => {
    const s = workoutToStored({
      startDate: "2026-05-01T10:00:00.000Z",
      duration: 2400,
      totalDistance: 10000,
      workoutType: "running",
      platformId: "lap-test",
      laps: [
        { distanceMeters: 1000, durationSeconds: 300 },
        { distance: 1000, duration: 280 },
      ],
    });
    expect(s.laps).toHaveLength(2);
    expect(s.laps![0].distanceMeters).toBe(1000);
    expect(s.laps![0].durationSeconds).toBe(300);
    expect(s.laps![1].durationSeconds).toBe(280);
  });

  test("workoutToStored maps workoutEvents type lap onto StoredHealthRun.laps", () => {
    const s = workoutToStored({
      startDate: "2026-05-01T10:00:00.000Z",
      duration: 1200,
      workoutType: "running",
      platformId: "evt-lap",
      workoutEvents: [
        { type: "lap", durationSeconds: 400, metadata: { distanceMeters: 800 } },
        { type: 3, duration: 390, metadata: { distance: 800 } },
        { type: "pause", durationSeconds: 60 },
      ],
    });
    expect(s.laps).toHaveLength(2);
    expect(s.laps![0].durationSeconds).toBe(400);
    expect(s.laps![0].distanceMeters).toBe(800);
  });

  test("workoutToStored without lap fields leaves laps undefined", () => {
    const s = workoutToStored({
      startDate: "2026-05-01T10:00:00.000Z",
      duration: 1800,
      workoutType: "running",
      platformId: "no-laps",
    });
    expect(s.laps).toBeUndefined();
  });

  test("workoutToStored prefers workoutActivityType when workoutType is missing", () => {
    const s = workoutToStored(
      {
        startDate: "2026-05-01T10:00:00.000Z",
        duration: 1800,
        workoutActivityType: "cycling",
        platformId: "p-act-only",
      },
      undefined,
    );
    expect(s.workoutType).toBe("cycling");
    expect(getStoredHealthRunCanonicalType(s)).toBe("bike");
  });

  test("partial permissions → missingCyclingDistance warning predicate", () => {
    expect(appleHealthMissingCyclingDistance(["workouts", "distance"])).toBe(true);
    expect(appleHealthMissingCyclingDistance(["workouts", "distanceCycling"])).toBe(false);
    expect(appleHealthMissingCyclingDistance(undefined)).toBe(false);
  });

  test("today coach ignores cycling when matching a planned run (cycling-only → no_run_today)", () => {
    const localNoon = new Date(2026, 5, 10, 12, 0, 0);
    const y = localNoon.getFullYear();
    const mo = String(localNoon.getMonth() + 1).padStart(2, "0");
    const da = String(localNoon.getDate()).padStart(2, "0");
    const todayCalendarYmd = `${y}-${mo}-${da}`;
    const startIso = localNoon.toISOString();

    const plannedSession: PlanSession = {
      id: "sess-easy",
      day: "Mi",
      date: "10. Jun",
      type: "easy",
      title: "Easy",
      km: 10,
    };

    const lines = buildTodayAppleCoachLines({
      platform: "ios",
      healthKitAvailable: true,
      isHealthConnected: true,
      healthRuns: [
        mkStored({
          startDate: startIso,
          duration: 3600,
          distanceMeters: 45_000,
          distanceUnknown: false,
          workoutType: "cycling",
          platformId: "only-bike",
        }),
      ],
      plannedSession,
      todaySessionMode: "today",
      deferAppleHealthPreview: false,
      todayCalendarYmd,
    });

    expect(lines.kind).toBe("no_run_today");
  });

  test("today coach still sees a run when both run and cycling exist same day", () => {
    const localNoon = new Date(2026, 7, 1, 12, 0, 0);
    const y = localNoon.getFullYear();
    const mo = String(localNoon.getMonth() + 1).padStart(2, "0");
    const da = String(localNoon.getDate()).padStart(2, "0");
    const todayCalendarYmd = `${y}-${mo}-${da}`;

    const plannedSession: PlanSession = {
      id: "sess-long",
      day: "Fr",
      date: "1. Aug",
      type: "easy",
      title: "Easy",
      km: 10,
    };

    const runStart = new Date(localNoon.getTime() - 3600_000).toISOString();
    const bikeStart = new Date(localNoon.getTime() - 7200_000).toISOString();

    const lines = buildTodayAppleCoachLines({
      platform: "ios",
      healthKitAvailable: true,
      isHealthConnected: true,
      healthRuns: [
        mkStored({
          startDate: bikeStart,
          duration: 3600,
          distanceMeters: 50_000,
          distanceUnknown: false,
          workoutType: "cycling",
          platformId: "bike-same",
        }),
        mkStored({
          startDate: runStart,
          duration: 3000,
          distanceMeters: 10_500,
          distanceUnknown: false,
          workoutType: "running",
          platformId: "run-same",
        }),
      ],
      plannedSession,
      todaySessionMode: "today",
      deferAppleHealthPreview: false,
      todayCalendarYmd,
    });

    expect(lines.kind).toBe("preview_compare");
    expect(lines.summary).toMatch(/Apple Health:/);
  });
});
