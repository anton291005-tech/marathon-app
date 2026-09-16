import {
  getHalfMarathonRacePaceScore,
  getPerformancePrediction,
  resolveHalfMarathonRaceSignal,
} from "./AppMain";

describe("getPerformancePrediction", () => {
  const baseArgs = {
    doneLongRuns: 3,
    longRuns: 4,
    doneHardSessions: 2,
    hardSessions: 3,
    avgFeeling: 4,
    progressRatio: 0.7,
    qualityLongRunScore: 0.6,
    targetSeconds: 3 * 3600 + 5 * 60,
  };

  it("matches the legacy formula when there is no current half-marathon result", () => {
    // No race signal at all (null/null) must reproduce the exact original
    // baseReadiness + 0.45*0.08 heuristic, unchanged.
    const p = getPerformancePrediction({
      ...baseArgs,
      halfMarathonRacePaceScore: null,
      halfMarathonRaceDaysAgo: null,
    });
    const longRunScore = 3 / 4;
    const hardScore = 2 / 3;
    const feelingScore = (4 - 2) / 3;
    const baseReadiness =
      longRunScore * 0.28 + hardScore * 0.24 + feelingScore * 0.14 + 0.7 * 0.16 + 0.6 * 0.1;
    const expectedReadiness = baseReadiness + 0.45 * 0.08;
    const expectedPredictedSeconds = baseArgs.targetSeconds + (1 - expectedReadiness) * 360;
    expect(p.predictedSeconds).toBeCloseTo(expectedPredictedSeconds, 5);
  });

  it("REGRESSION GUARD (former bug): a strong, current half-marathon result now moves the prediction far more than 30s", () => {
    const withStrongCurrentRace = getPerformancePrediction({
      ...baseArgs,
      halfMarathonRacePaceScore: 1,
      halfMarathonRaceDaysAgo: 10,
    });
    const withNoRace = getPerformancePrediction({
      ...baseArgs,
      halfMarathonRacePaceScore: null,
      halfMarathonRaceDaysAgo: null,
    });
    // Previously the max swing from best-vs-worst half-marathon signal was capped at
    // 0.08 * 360 = 28.8s. A dominant, current race result must now move it dramatically more.
    expect(Math.abs(withNoRace.predictedSeconds - withStrongCurrentRace.predictedSeconds)).toBeGreaterThan(60);
  });

  it("a strong, current race result can lift confidence to 'hoch' even with so-so training completion", () => {
    const mediocreTraining = {
      doneLongRuns: 2,
      longRuns: 4,
      doneHardSessions: 1,
      hardSessions: 3,
      avgFeeling: 3,
      progressRatio: 0.5,
      qualityLongRunScore: 0.5,
      targetSeconds: 3 * 3600 + 5 * 60,
    };
    const withoutRace = getPerformancePrediction({
      ...mediocreTraining,
      halfMarathonRacePaceScore: null,
      halfMarathonRaceDaysAgo: null,
    });
    const withStrongRace = getPerformancePrediction({
      ...mediocreTraining,
      halfMarathonRacePaceScore: 1,
      halfMarathonRaceDaysAgo: 5,
    });
    expect(withoutRace.confidence).not.toBe("hoch");
    expect(withStrongRace.confidence).toBe("hoch");
  });

  it("a weak, current race result pulls confidence down even with strong training completion", () => {
    const strongTraining = {
      doneLongRuns: 4,
      longRuns: 4,
      doneHardSessions: 3,
      hardSessions: 3,
      avgFeeling: 4.5,
      progressRatio: 0.95,
      qualityLongRunScore: 0.9,
      targetSeconds: 3 * 3600 + 5 * 60,
    };
    const withoutRace = getPerformancePrediction({
      ...strongTraining,
      halfMarathonRacePaceScore: null,
      halfMarathonRaceDaysAgo: null,
    });
    const withWeakRace = getPerformancePrediction({
      ...strongTraining,
      halfMarathonRacePaceScore: 0,
      halfMarathonRaceDaysAgo: 5,
    });
    expect(withWeakRace.predictedSeconds).toBeGreaterThan(withoutRace.predictedSeconds);
  });

  it("a race older than the 120-day window no longer influences readiness at all", () => {
    const withOldRace = getPerformancePrediction({
      ...baseArgs,
      halfMarathonRacePaceScore: 1,
      halfMarathonRaceDaysAgo: 130,
    });
    const withoutRace = getPerformancePrediction({
      ...baseArgs,
      halfMarathonRacePaceScore: null,
      halfMarathonRaceDaysAgo: null,
    });
    expect(withOldRace.predictedSeconds).toBeCloseTo(withoutRace.predictedSeconds, 5);
  });

  it("a race between 60 and 120 days old has partial (decaying), not full, influence", () => {
    const fresh = getPerformancePrediction({ ...baseArgs, halfMarathonRacePaceScore: 1, halfMarathonRaceDaysAgo: 30 });
    const halfway = getPerformancePrediction({ ...baseArgs, halfMarathonRacePaceScore: 1, halfMarathonRaceDaysAgo: 90 });
    const stale = getPerformancePrediction({ ...baseArgs, halfMarathonRacePaceScore: 1, halfMarathonRaceDaysAgo: 130 });
    // Strictly decaying pull toward the no-race baseline as the race ages.
    expect(fresh.predictedSeconds).toBeLessThan(halfway.predictedSeconds);
    expect(halfway.predictedSeconds).toBeLessThan(stale.predictedSeconds);
  });
});

describe("getHalfMarathonRacePaceScore", () => {
  it("is centered at 0.5 when the race's Riegel projection exactly matches the target", () => {
    const targetSeconds = 3 * 3600;
    // Riegel-invert: find a half-marathon duration whose marathon projection is exactly targetSeconds.
    const projectedFromHalf = (durationSec: number) => durationSec * Math.pow(42.195 / 21.0975, 1.06);
    // Solve durationSec such that projectedFromHalf(durationSec) === targetSeconds.
    const durationSec = targetSeconds / Math.pow(42.195 / 21.0975, 1.06);
    const score = getHalfMarathonRacePaceScore({ actualDistanceKm: 21.0975, actualDurationSec: durationSec, targetSeconds });
    expect(score).toBeCloseTo(0.5, 2);
  });

  it("returns a high score for a race that projects well ahead of the target", () => {
    const targetSeconds = 3 * 3600 + 5 * 60; // 3:05:00
    const raceDurationSec = 1 * 3600 + 25 * 60 + 37; // 1:25:37 half marathon
    const score = getHalfMarathonRacePaceScore({ actualDistanceKm: 21.0975, actualDurationSec: raceDurationSec, targetSeconds });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0.8);
  });

  it("returns a low score for a race that projects well behind the target", () => {
    const targetSeconds = 2 * 3600 + 55 * 60; // ambitious sub-3 goal
    const raceDurationSec = 1 * 3600 + 55 * 60; // slow half marathon
    const score = getHalfMarathonRacePaceScore({ actualDistanceKm: 21.0975, actualDurationSec: raceDurationSec, targetSeconds });
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(0.2);
  });

  it("returns null when the distance is below half-marathon", () => {
    const score = getHalfMarathonRacePaceScore({ actualDistanceKm: 15, actualDurationSec: 4000, targetSeconds: 10800 });
    expect(score).toBeNull();
  });

  it("returns null when duration is missing/invalid", () => {
    const score = getHalfMarathonRacePaceScore({ actualDistanceKm: 21.0975, actualDurationSec: 0, targetSeconds: 10800 });
    expect(score).toBeNull();
  });
});

describe("resolveHalfMarathonRaceSignal", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  function raceSession(date: string) {
    return { id: "race1", day: "Mo", date, type: "race", title: "Halbmarathon", km: 21, desc: "", pace: null };
  }

  it("returns null/null when no qualifying race exists", () => {
    const result = resolveHalfMarathonRaceSignal({
      activeSessions: [{ id: "a", day: "Mo", date: "8. Jun", type: "long", title: "L", km: 20, desc: "", pace: null }],
      logs: {},
      healthRunById: new Map(),
      targetSeconds: 10800,
      now,
    });
    expect(result.halfMarathonRacePaceScore).toBeNull();
    expect(result.halfMarathonRaceDaysAgo).toBeNull();
  });

  it("resolves distance/duration/age from a completed race session with an assigned health run", () => {
    const raceDurationSec = 1 * 3600 + 25 * 60 + 37;
    const raceDistanceKm = 21.0975;
    const healthRunById = new Map([
      [
        "race1run",
        { runId: "race1run", workoutType: "running", duration: raceDurationSec, distanceMeters: raceDistanceKm * 1000 },
      ],
    ]);
    const logs = {
      race1: {
        done: true,
        assignedRun: { runId: "race1run", startDate: "s", duration: raceDurationSec, distanceKm: raceDistanceKm },
      },
    };
    const result = resolveHalfMarathonRaceSignal({
      activeSessions: [raceSession("1. Jun")],
      logs,
      healthRunById,
      targetSeconds: 3 * 3600 + 5 * 60,
      now,
    });
    expect(result.halfMarathonRaceDaysAgo).toBe(9);
    expect(result.halfMarathonRacePaceScore).not.toBeNull();
    expect(result.halfMarathonRacePaceScore!).toBeGreaterThan(0.5);
  });

  it("ignores a race session that isn't logged as done", () => {
    const result = resolveHalfMarathonRaceSignal({
      activeSessions: [raceSession("1. Jun")],
      logs: {},
      healthRunById: new Map(),
      targetSeconds: 10800,
      now,
    });
    expect(result.halfMarathonRacePaceScore).toBeNull();
    expect(result.halfMarathonRaceDaysAgo).toBeNull();
  });
});
