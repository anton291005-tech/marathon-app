import {
  computeIntervalStructureAdherenceScore,
  computePlanAdherenceScore,
  parsePlannedPaceRangeSecPerKm,
  scoreHrBpmComponent,
  scoreIntervalPaceVsPlannedMid,
} from "./planAdherenceScore";

describe("planAdherenceScore", () => {
  test("parsePlannedPaceRangeSecPerKm parses single pace", () => {
    expect(parsePlannedPaceRangeSecPerKm("3:58/km")).toEqual({ min: 238, max: 238 });
  });

  test("parsePlannedPaceRangeSecPerKm parses range pace", () => {
    expect(parsePlannedPaceRangeSecPerKm("5:30–5:50/km")).toEqual({ min: 330, max: 350 });
  });

  test("within range -> score 100 for that component", () => {
    const r = computePlanAdherenceScore({
      plannedPaceSecPerKm: { min: 300, max: 330 },
      actualPaceSecPerKm: 315,
      plannedDistanceKm: 10,
      actualDistanceKm: 10,
      plannedHrBpm: { min: 130, max: 150 },
      actualHrBpm: 140,
    });
    expect(r.score).toBe(100);
    expect(r.statuses.pace).toBe("green");
    expect(r.statuses.distance).toBe("green");
    expect(r.statuses.hr).toBe("green");
  });

  test("missing metrics are excluded from mean", () => {
    const r = computePlanAdherenceScore({
      plannedDistanceKm: 10,
      actualDistanceKm: 8,
      plannedPaceSecPerKm: null,
      actualPaceSecPerKm: null,
      plannedHrBpm: null,
      actualHrBpm: null,
    });
    expect(r.components.distanceAccuracy).toBeDefined();
    expect(r.components.paceAccuracy).toBeUndefined();
    expect(r.components.hrAccuracy).toBeUndefined();
    expect(r.statuses.pace).toBe("na");
    expect(r.statuses.hr).toBe("na");
  });

  test("easy run slower than corridor → pace penalized", () => {
    const r = computePlanAdherenceScore({
      plannedPaceSecPerKm: { min: 300, max: 320 },
      actualPaceSecPerKm: 360,
      plannedDistanceKm: 10,
      actualDistanceKm: 10,
    });
    expect(r.statuses.pace).toBe("red");
    expect((r.components.paceAccuracy ?? 0)).toBeLessThan(95);
  });

  test("interval metric ignores misleading full-session avg pace vs reps-on-target intensity", () => {
    const target = { min: 250, max: 250 };
    const globalAvg = 308;
    const withoutGuard = computePlanAdherenceScore({
      plannedPaceSecPerKm: target,
      actualPaceSecPerKm: globalAvg,
      plannedDistanceKm: 12,
      actualDistanceKm: 12,
    });
    expect(withoutGuard.score).toBeLessThan(85);

    const withIntervalMetric = computePlanAdherenceScore({
      plannedPaceSecPerKm: target,
      actualPaceSecPerKm: globalAvg,
      plannedDistanceKm: 12,
      actualDistanceKm: 12,
      useIntervalPaceMetric: true,
      intervalIntensityScore0_100: 95,
      intervalAvgPaceSecPerKm: 250,
    });
    expect(withIntervalMetric.score).toBeGreaterThanOrEqual(92);
    expect(withIntervalMetric.statuses.pace).toBe("green");
  });

  test("far off-plan degrades score and status red", () => {
    const r = computePlanAdherenceScore({
      plannedDistanceKm: 10,
      actualDistanceKm: 6,
      plannedPaceSecPerKm: { min: 300, max: 310 },
      actualPaceSecPerKm: 380,
      plannedHrBpm: { min: 140, max: 150 },
      actualHrBpm: 170,
    });
    expect(r.score).toBeLessThan(70);
    expect(r.statuses.distance).toBe("red");
    expect(r.statuses.pace).toBe("red");
    expect(r.statuses.hr).toBe("red");
  });

  test("scoreHrBpmComponent penalizes HR clearly above planned range", () => {
    expect(scoreHrBpmComponent(153, { min: 120, max: 140 })).toBe(65);
  });

  test("HR above range lowers weighted Umsetzung even when pace and distance match", () => {
    const r = computePlanAdherenceScore({
      plannedPaceSecPerKm: { min: 300, max: 320 },
      actualPaceSecPerKm: 310,
      plannedDistanceKm: 10,
      actualDistanceKm: 10,
      plannedHrBpm: { min: 120, max: 140 },
      actualHrBpm: 153,
    });
    expect(r.components.hrAccuracy).toBe(65);
    expect(r.score).toBe(90);
    expect(r.score).toBeLessThan(100);
  });

  test("missing HR reweights pace and distance to 57/43", () => {
    const r = computePlanAdherenceScore({
      plannedPaceSecPerKm: { min: 300, max: 320 },
      actualPaceSecPerKm: 310,
      plannedDistanceKm: 10,
      actualDistanceKm: 10,
      plannedHrBpm: null,
      actualHrBpm: null,
    });
    expect(r.components.hrAccuracy).toBeUndefined();
    expect(r.score).toBe(100);
  });
});

describe("computeIntervalStructureAdherenceScore (Strategy F)", () => {
  test("on-target interval pace with matching distance yields high score", () => {
    const paceScore = scoreIntervalPaceVsPlannedMid(250, 250);
    expect(paceScore).toBe(100);
    const score = computeIntervalStructureAdherenceScore({
      intervalAvgPaceSecPerKm: 250,
      plannedPaceMidSec: 250,
      actualDistanceKm: 14.1,
      plannedDistanceKm: 14.1,
    });
    expect(score).toBeGreaterThanOrEqual(95);
  });

  test("weights pace 60% and distance 40% when HR unavailable", () => {
    const score = computeIntervalStructureAdherenceScore({
      intervalAvgPaceSecPerKm: 280,
      plannedPaceMidSec: 250,
      actualDistanceKm: 10,
      plannedDistanceKm: 10,
    });
    const paceOnly = scoreIntervalPaceVsPlannedMid(280, 250);
    expect(score).toBe(Math.round(paceOnly * 0.6 + 100 * 0.4));
  });
});

