import { backfillIntervalWorkoutScores } from "./backfillIntervalWorkoutScores";
import {
  detectIntervalWorkout,
  extractIntervalMetrics,
  extractIntervalSegments,
  parseIntervalPlanInfo,
  scoreIntervalWorkout,
} from "./intervalSegmentExtractor";
import { parseStructuredWorkoutSpecFromDesc } from "../../sessionDistance";
import type { SplitEntry, WorkoutLap } from "./intervalSegmentExtractor";
import { analyzeIntensity } from "./analyzeIntensity";
import { buildCoachFeedback } from "./buildCoachFeedback";
import type { IntervalMeta, IntervalSegment } from "./types";

// ---------------------------------------------------------------------------
// Helper: build a set of uniform effort laps + recovery laps
// ---------------------------------------------------------------------------

function makeLaps(
  repCount: number,
  effortPaceSecPerKm: number,
  effortDistanceMeters: number,
  recoveryPaceSecPerKm: number,
  recoveryDistanceMeters: number,
): WorkoutLap[] {
  const laps: WorkoutLap[] = [];
  for (let i = 0; i < repCount; i++) {
    // effort
    const effortDur = (effortDistanceMeters / 1000) * effortPaceSecPerKm;
    laps.push({
      distanceMeters: effortDistanceMeters,
      durationSeconds: effortDur,
      avgPaceSecPerKm: effortPaceSecPerKm,
    });
    // recovery (except after last)
    if (i < repCount - 1) {
      const recDur = (recoveryDistanceMeters / 1000) * recoveryPaceSecPerKm;
      laps.push({
        distanceMeters: recoveryDistanceMeters,
        durationSeconds: recDur,
        avgPaceSecPerKm: recoveryPaceSecPerKm,
      });
    }
  }
  return laps;
}

function makeSegments(
  count: number,
  paceSecPerKm: number,
  distanceMeters = 1000,
): IntervalSegment[] {
  return Array.from({ length: count }, () => ({
    startTime: 0,
    endTime: 0,
    durationSeconds: (distanceMeters / 1000) * paceSecPerKm,
    distanceMeters,
    avgPaceSecPerKm: paceSecPerKm,
  }));
}

const TARGET_4_10 = 4 * 60 + 10; // 250 s/km
/** After parse fix: 10×400m @ 3:40 remains 220 s/km (not split). */
const TARGET_3_40 = 3 * 60 + 40; // 220 s/km
/** 10×400m @ 1:28 as rep split → 88/0.4 = 220 s/km */
const TARGET_400_SPLIT_1_28 = 88 / 0.4;
const TARGET_200_SPLIT_0_42 = 42 / 0.2; // 210 s/km
const RECOVERY_PACE = 6 * 60; // 360 s/km (slow jog)

// ---------------------------------------------------------------------------
// detectIntervalWorkout
// ---------------------------------------------------------------------------

describe("detectIntervalWorkout", () => {
  test("keyword 'interval' in sessionType", () => {
    expect(detectIntervalWorkout("interval")).toBe(true);
  });

  test("keyword 'Intervall' (German) in title", () => {
    expect(detectIntervalWorkout(null, "Intervalltraining")).toBe(true);
  });

  test("structural pattern 5×2000m in planDescription", () => {
    expect(detectIntervalWorkout(null, null, "5×2000m @ 4:10")).toBe(true);
  });

  test("structural pattern with 'x' (not ×)", () => {
    expect(detectIntervalWorkout(null, null, "10x400m @ 3:40")).toBe(true);
  });

  test("'tempo' type alone → false (continuous tempo = full-session pace)", () => {
    expect(detectIntervalWorkout("tempo")).toBe(false);
  });

  test("'tempo' type with explicit reps in plan → true", () => {
    expect(detectIntervalWorkout("tempo", "Mix", "8×1000m @ 3:55")).toBe(true);
  });

  test("Detection: \"5×2000m Intervalle\" title", () => {
    expect(detectIntervalWorkout(null, "5×2000m Intervalle")).toBe(true);
  });

  test("Detection: \"10x400m Track Session\"", () => {
    expect(detectIntervalWorkout(null, "10x400m Track Session")).toBe(true);
  });

  test("Detection: \"Intervall Training\"", () => {
    expect(detectIntervalWorkout(null, "Intervall Training")).toBe(true);
  });

  test("Detection: \"Easy Run 45min\" — false", () => {
    expect(detectIntervalWorkout("easy", "Easy Run 45min", null)).toBe(false);
  });

  test("Detection: \"Langer Lauf\" alone — false", () => {
    expect(detectIntervalWorkout(null, "Langer Lauf")).toBe(false);
  });

  test("Detection: structural \"8 × 1000m @ 3:45\" without keyword — true", () => {
    expect(detectIntervalWorkout("easy", "Morning run", "8 × 1000m @ 3:45")).toBe(true);
  });

  test("easy run — no false positive", () => {
    expect(detectIntervalWorkout("easy", "Lockerer Lauf", "5:20/km")).toBe(false);
  });

  test("long run — no false positive", () => {
    expect(detectIntervalWorkout("long", "Langer Lauf", "5:40/km")).toBe(false);
  });

  test("empty inputs — no crash, returns false", () => {
    expect(detectIntervalWorkout()).toBe(false);
    expect(detectIntervalWorkout(null, null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseIntervalPlanInfo
// ---------------------------------------------------------------------------

describe("parseIntervalPlanInfo — six formats (Fix 9)", () => {
  test("\"5×2000m @ 4:10\"", () => {
    const info = parseIntervalPlanInfo("5×2000m @ 4:10");
    expect(info?.repCount).toBe(5);
    expect(info?.repDistance).toBe(2000);
    expect(info?.targetPaceSecPerKm).toBe(250);
  });

  test("\"10x400m @ 1:28\" → split pace 220 s/km", () => {
    const info = parseIntervalPlanInfo("10x400m @ 1:28");
    expect(info?.repCount).toBe(10);
    expect(info?.repDistance).toBe(400);
    expect(info?.targetPaceSecPerKm).toBe(TARGET_400_SPLIT_1_28);
    expect(info?.targetPaceSecPerKm).toBe(220);
  });

  test("\"8 × 1000m bei 3:45\"", () => {
    const info = parseIntervalPlanInfo("8 × 1000m bei 3:45");
    expect(info?.repCount).toBe(8);
    expect(info?.repDistance).toBe(1000);
    expect(info?.targetPaceSecPerKm).toBe(225);
  });

  test("\"6×800m in 3:30/km\"", () => {
    const info = parseIntervalPlanInfo("6×800m in 3:30/km");
    expect(info?.repCount).toBe(6);
    expect(info?.repDistance).toBe(800);
    expect(info?.targetPaceSecPerKm).toBe(210);
  });

  test("\"12 × 200m @ 0:42\" → split pace 210 s/km", () => {
    const info = parseIntervalPlanInfo("12 × 200m @ 0:42");
    expect(info?.repCount).toBe(12);
    expect(info?.repDistance).toBe(200);
    expect(info?.targetPaceSecPerKm).toBe(TARGET_200_SPLIT_0_42);
    expect(info?.targetPaceSecPerKm).toBe(210);
  });

  test("\"3×5km @ 4:30\"", () => {
    const info = parseIntervalPlanInfo("3×5km @ 4:30");
    expect(info?.repCount).toBe(3);
    expect(info?.repDistance).toBe(5000);
    expect(info?.targetPaceSecPerKm).toBe(270);
  });
});

describe("parseIntervalPlanInfo (remaining)", () => {
  test("10×400m @ 3:40 still km-pace 220", () => {
    const info = parseIntervalPlanInfo("10×400m @ 3:40");
    expect(info?.repCount).toBe(10);
    expect(info?.repDistance).toBe(400);
    expect(info?.targetPaceSecPerKm).toBe(TARGET_3_40);
  });

  test("standalone pace string 4:10/km", () => {
    const info = parseIntervalPlanInfo("4:10/km");
    expect(info?.targetPaceSecPerKm).toBe(TARGET_4_10);
  });

  test("null / unparseable returns null, no throw", () => {
    expect(parseIntervalPlanInfo(null)).toBeNull();
    expect(parseIntervalPlanInfo()).toBeNull();
    expect(parseIntervalPlanInfo("")).toBeNull();
    expect(parseIntervalPlanInfo("Easy run 45min")).toBeNull();
  });
});

describe("backfillIntervalWorkoutScores", () => {
  test("backfillIntervalWorkoutScores re-scores a stored interval workout and sets scoringVersion: interval_v2", async () => {
    const TARGET = TARGET_4_10;
    const laps = makeLaps(5, TARGET, 2000, RECOVERY_PACE, 400);
    const durationSec = laps.reduce((a, l) => a + l.durationSeconds, 0);
    const runId = "test-interval-run-1";
    const healthRuns = [
      {
        runId,
        startDate: "2026-03-01T08:00:00.000Z",
        duration: durationSec,
        distanceMeters: Math.round(
          laps.reduce((a, l) => a + (l.distanceMeters ?? 0), 0),
        ),
        distanceUnknown: false,
        workoutType: "running",
        sourceName: "Apple Health",
        avgHeartRateBpm: 165,
        intervalIntensitySnapshot: {
          intensityScore: 46,
          coachMessage: "legacy",
          scoringVersion: "interval_v2_no_segments",
          updatedAt: "2026-03-01T09:00:00.000Z",
        },
        laps,
      },
    ];
    const logs = {
      sess_interval_1: {
        done: true,
        at: "2026-03-01T10:00:00.000Z",
        assignedRun: {
          runId,
          duration: durationSec,
          distanceKm: healthRuns[0].distanceMeters! / 1000,
          avgHeartRateBpm: 165,
        },
      },
    };
    const planSessions = [
      {
        id: "sess_interval_1",
        date: "1. Mär.",
        type: "interval",
        title: "5×2000m Intervalle",
        pace: "5×2000m @ 4:10/km",
        km: 14,
      },
    ];

    const result = await backfillIntervalWorkoutScores({
      healthRuns: healthRuns as any,
      logs: logs as any,
      planSessions,
      maxHeartRateBpm: 190,
    });

    const snap = result.healthRuns[0].intervalIntensitySnapshot;
    expect(snap?.scoringVersion).toBe("interval_v2");
    expect(snap?.verdictVersion).toBe("interval_v2");
    expect(typeof snap?.intensityScore).toBe("number");
    expect(snap!.intensityScore!).toBeGreaterThanOrEqual(90);
    expect(
      String(
        (
          result.mutatedSessionLogs as Record<
            string,
            { runEvaluation?: { label?: string } }
          >
        ).sess_interval_1?.runEvaluation?.label ?? "",
      ),
    ).toContain("Intervall");
  });
});

// ---------------------------------------------------------------------------
// extractIntervalSegments — bimodal classification
// ---------------------------------------------------------------------------

describe("extractIntervalSegments — lap data", () => {
  test("5×2000m laps: effort group extracted correctly", () => {
    const laps = makeLaps(5, TARGET_4_10, 2000, RECOVERY_PACE, 400);
    const result = extractIntervalSegments(laps);
    expect(result).not.toBeNull();
    expect(result!.extractionStrategy).toBe("splits"); // no HK timestamps → Strategy B
    expect(result!.effortSegments).toHaveLength(5);
    result!.effortSegments.forEach((seg) => {
      expect(seg.avgPaceSecPerKm).toBeCloseTo(TARGET_4_10, 0);
      expect(seg.startTime).toBe(0);
      expect(seg.endTime).toBe(0);
    });
  });

  test("Strategy A: timestamp laps → extractionStrategy laps", () => {
    const t0 = Date.UTC(2026, 0, 1, 8, 0, 0);
    const laps: WorkoutLap[] = [];
    for (let i = 0; i < 5; i++) {
      const effortDur = (2000 / 1000) * TARGET_4_10;
      const e0 = t0 + i * 600_000;
      laps.push({
        distanceMeters: 2000,
        durationSeconds: effortDur,
        avgPaceSecPerKm: TARGET_4_10,
        startDate: e0,
        endDate: e0 + effortDur * 1000,
      });
      if (i < 4) {
        const recDur = (400 / 1000) * RECOVERY_PACE;
        const r0 = e0 + effortDur * 1000;
        laps.push({
          distanceMeters: 400,
          durationSeconds: recDur,
          avgPaceSecPerKm: RECOVERY_PACE,
          startDate: r0,
          endDate: r0 + recDur * 1000,
        });
      }
    }
    const result = extractIntervalSegments(laps);
    expect(result).not.toBeNull();
    expect(result!.extractionStrategy).toBe("laps");
    expect(result!.effortSegments).toHaveLength(5);
    expect(result!.effortSegments[0].startTime).toBeGreaterThan(0);
    expect(result!.effortSegments[0].endTime).toBeGreaterThanOrEqual(result!.effortSegments[0].startTime);
  });

  test("Strategy B: explicit splits array", () => {
    const splits: SplitEntry[] = [];
    for (let i = 0; i < 5; i++) {
      splits.push({
        distanceMeters: 2000,
        durationSeconds: (2000 / 1000) * TARGET_4_10,
        avgPaceSecPerKm: TARGET_4_10,
      });
      if (i < 4) {
        splits.push({
          distanceMeters: 400,
          durationSeconds: (400 / 1000) * RECOVERY_PACE,
          avgPaceSecPerKm: RECOVERY_PACE,
        });
      }
    }
    const result = extractIntervalSegments(null, null, splits);
    expect(result).not.toBeNull();
    expect(result!.extractionStrategy).toBe("splits");
    expect(result!.effortSegments).toHaveLength(5);
  });

  test("10×400m: effort group has 10 segments", () => {
    const laps = makeLaps(10, TARGET_3_40, 400, RECOVERY_PACE, 200);
    const result = extractIntervalSegments(laps);
    expect(result).not.toBeNull();
    expect(result!.extractionStrategy).toBe("splits");
    expect(result!.effortSegments).toHaveLength(10);
  });

  test("12×200m: effort group has 12 segments", () => {
    const laps = makeLaps(12, TARGET_3_40, 200, RECOVERY_PACE, 100);
    const result = extractIntervalSegments(laps);
    expect(result).not.toBeNull();
    expect(result!.effortSegments).toHaveLength(12);
  });

  test("5 fast + 5 slow alternating laps → 5 effort segments", () => {
    const laps: WorkoutLap[] = [];
    for (let i = 0; i < 5; i++) {
      laps.push({ distanceMeters: 1000, durationSeconds: 240, avgPaceSecPerKm: 240 });
      laps.push({ distanceMeters: 1000, durationSeconds: 360, avgPaceSecPerKm: 360 });
    }
    const result = extractIntervalSegments(laps);
    expect(result).not.toBeNull();
    expect(result!.effortSegments).toHaveLength(5);
  });

  test("single uniform easy run: no interval structure detected", () => {
    const easyLaps: WorkoutLap[] = Array.from({ length: 10 }, () => ({
      distanceMeters: 1000,
      durationSeconds: 320,
      avgPaceSecPerKm: 320,
    }));
    expect(extractIntervalSegments(easyLaps)).toBeNull();
  });

  test("single fast lap: sanity check fails → null", () => {
    const laps: WorkoutLap[] = [
      { distanceMeters: 1000, durationSeconds: 250, avgPaceSecPerKm: 250 },
      { distanceMeters: 200, durationSeconds: 120, avgPaceSecPerKm: 360 },
    ];
    expect(extractIntervalSegments(laps)).toBeNull();
  });

  test("8×1000m with WU/CD km-splits: plan fastest-rep strategy picks 8 effort laps", () => {
    const TARGET = TARGET_4_10;
    const laps: WorkoutLap[] = [];
    for (let i = 0; i < 2; i++) {
      laps.push({ distanceMeters: 1000, durationSeconds: 330, avgPaceSecPerKm: 330 });
    }
    laps.push(...makeLaps(8, TARGET, 1000, RECOVERY_PACE, 200));
    for (let i = 0; i < 2; i++) {
      laps.push({ distanceMeters: 1000, durationSeconds: 330, avgPaceSecPerKm: 330 });
    }
    const planDesc = "2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km CD.";
    const result = extractIntervalSegments(laps, null, null, planDesc);
    expect(result).not.toBeNull();
    expect(result!.effortSegments).toHaveLength(8);
    const avg = result!.effortSegments.reduce((a, s) => a + s.avgPaceSecPerKm, 0) / 8;
    expect(avg).toBeCloseTo(TARGET, 0);
    const { score } = scoreIntervalWorkout(
      result!.effortSegments,
      TARGET,
      8,
      result!.extractionStrategy,
    );
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(100);
  });

  test("no inputs → null", () => {
    expect(extractIntervalSegments(null, null, null)).toBeNull();
  });

  test("no crash when laps is empty array → null", () => {
    expect(() => extractIntervalSegments([])).not.toThrow();
    expect(extractIntervalSegments([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scoreIntervalWorkout
// ---------------------------------------------------------------------------

describe("scoreIntervalWorkout — scoring math", () => {
  // Perfect execution: 5×2000m all at 4:10/km, target 4:10/km → ≥ 90
  test("perfect execution scores ≥ 90", () => {
    const segs = makeSegments(5, TARGET_4_10, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(90);
  });

  // Slightly off pace: 5×2000m at 4:25/km, target 4:10/km
  // delta=15 s/km → paceScore bracket 75 → 40+45+5=90 (formula-exact)
  test("5 reps all +15s/km vs target → formula ≥ 83", () => {
    const segs = makeSegments(5, TARGET_4_10 + 15, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(83);
  });

  test("5 reps all +35s/km vs target → score 69–80 (formula-rounded)", () => {
    const segs = makeSegments(5, TARGET_4_10 + 35, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(68);
    expect(score).toBeLessThanOrEqual(80);
  });

  test("slightly off pace scores lower than perfect", () => {
    const actual = 4 * 60 + 25; // 265 s/km
    const segs = makeSegments(5, actual, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    // Must be < perfect (100) and well below 95 for being 15s/km off target
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(95);
    // Explicitly lower than perfect execution
    const perfect = scoreIntervalWorkout(makeSegments(5, TARGET_4_10, 2000), TARGET_4_10, 5, "laps");
    expect(score).toBeLessThan(perfect.score);
  });

  // Missing reps, good pace: 4 of 5 reps at 4:12/km
  // repScore = 4/5*40=32, paceScore = 95*0.6=57, bonus=5 → 94
  test("4/5 reps on pace → score ≥ 85", () => {
    const actual = 4 * 60 + 12; // 252 s/km
    const segs = makeSegments(4, actual, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(85);
    const full = scoreIntervalWorkout(makeSegments(5, actual, 2000), TARGET_4_10, 5, "laps");
    expect(score).toBeLessThan(full.score);
  });

  test("2/5 reps on pace → score 68–78", () => {
    const actual = 4 * 60 + 12;
    const segs = makeSegments(2, actual, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(68);
    expect(score).toBeLessThanOrEqual(78);
  });

  // All reps, poor pace: 5×2000m at 4:50/km
  // delta=40 s/km → paceScore bracket 40 → 40+24+5=69
  test("all reps, poor pace 4:50/km → significantly below perfect", () => {
    const actual = 4 * 60 + 50; // 290 s/km
    const segs = makeSegments(5, actual, 2000);
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(62);
    expect(score).toBeLessThanOrEqual(75);
    // Must be significantly lower than on-target execution
    expect(score).toBeLessThan(80);
  });

  // Short intervals: 10×400m at 3:40/km, target 3:40/km → ≥ 90
  test("10×400m perfect execution → ≥ 90", () => {
    const segs = makeSegments(10, TARGET_3_40, 400);
    const { score } = scoreIntervalWorkout(segs, TARGET_3_40, 10, "laps");
    expect(score).toBeGreaterThanOrEqual(90);
  });

  // Very short intervals: 12×200m all at target → ≥ 90
  test("12×200m perfect execution → ≥ 90", () => {
    const segs = makeSegments(12, TARGET_3_40, 200);
    const { score } = scoreIntervalWorkout(segs, TARGET_3_40, 12, "laps");
    expect(score).toBeGreaterThanOrEqual(90);
  });

  test("20×200m, 18 of 20 on pace → score ≥ 85", () => {
    const segs = makeSegments(18, TARGET_3_40, 200);
    const { score } = scoreIntervalWorkout(segs, TARGET_3_40, 20, "laps");
    expect(score).toBeGreaterThanOrEqual(85);
  });

  // Pyramid: effort reps have intentional spread but all on pace → ≥ 85
  test("pyramid session all on pace → ≥ 85", () => {
    const distances = [400, 800, 1200, 800, 400];
    const segs: IntervalSegment[] = distances.map((d) => ({
      startTime: 0,
      endTime: 0,
      durationSeconds: (d / 1000) * TARGET_4_10,
      distanceMeters: d,
      avgPaceSecPerKm: TARGET_4_10,
    }));
    const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
    expect(score).toBeGreaterThanOrEqual(85);
  });

  test("pace fade: last reps ~15s/km slower → paceFadeDetected true", () => {
    const fast = 4 * 60;
    const slow = 4 * 60 + 15;
    const segs: IntervalSegment[] = [
      ...makeSegments(3, fast, 1000),
      ...makeSegments(2, slow, 1000),
    ];
    const { meta } = scoreIntervalWorkout(segs, fast, 5, "laps");
    expect(meta.paceFadeDetected).toBe(true);
  });

  // Pace fade: first 3 at 4:00, last 2 at 4:20, target 4:00
  // formula: avg paceScore ≈ (3×100 + 2×75)/5 * 0.60 = 54, repScore=40, bonus=2 → 96
  // Fade is captured in the boolean flag; score reflects partial success
  test("pace fade detected — flag is set, score reflects mixed execution", () => {
    const fastPace = 4 * 60; // 240 s/km
    const slowPace = 4 * 60 + 20; // 260 s/km
    const segs: IntervalSegment[] = [
      ...makeSegments(3, fastPace, 1000),
      ...makeSegments(2, slowPace, 1000),
    ];
    const { score, meta } = scoreIntervalWorkout(segs, fastPace, 5, "laps");
    // All reps completed; first 3 perfect, last 2 at boundary of "good" (20s delta)
    expect(score).toBeGreaterThanOrEqual(85);
    expect(meta.paceFadeDetected).toBe(true);
    // Score must be lower than if all 5 were at fastPace
    const noFade = scoreIntervalWorkout(makeSegments(5, fastPace, 1000), fastPace, 5, "laps");
    expect(score).toBeLessThan(noFade.score);
  });

  test("no target pace + no target reps: pure consistency score", () => {
    const segs = makeSegments(5, TARGET_4_10, 1000);
    const { score, meta } = scoreIntervalWorkout(segs, null, null, "laps");
    expect(score).toBe(100);
    expect(meta.targetPace).toBeNull();
    expect(meta.targetReps).toBeNull();
  });

  // Score is always 0..100
  test("score is clamped 0..100 for all inputs", () => {
    const cases = [
      makeSegments(1, TARGET_4_10, 1000), // edge: 1 segment
      makeSegments(10, 600, 1000),         // very slow
      makeSegments(5, 150, 1000),          // absurdly fast
    ];
    for (const segs of cases) {
      const { score } = scoreIntervalWorkout(segs, TARGET_4_10, 5, "laps");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// analyzeIntensity — interval branch integration
// ---------------------------------------------------------------------------

describe("analyzeIntensity — interval branch", () => {
  const BASE = {
    durationMinutes: 60,
    actualHrBpm: null,
    expectedHrBpm: null,
    actualPaceSecPerKm: 308, // 5:08/km global avg (misleading)
    plannedPaceSecPerKm: { min: TARGET_4_10, max: TARGET_4_10 },
  };

  test("interval session with laps uses model='interval', not pace_only", () => {
    const laps = makeLaps(5, TARGET_4_10, 2000, RECOVERY_PACE, 400);
    const result = analyzeIntensity({
      ...BASE,
      sessionType: "interval",
      planDescription: "5×2000m @ 4:10",
      laps,
    });
    expect(result?.model).toBe("interval");
    expect(result?.signalSource).toBe("interval_segments");
    expect(result?.intensityScore).toBeGreaterThanOrEqual(90);
  });

  test("standard easy run is unaffected — no interval branch triggered", () => {
    const result = analyzeIntensity({
      ...BASE,
      sessionType: "easy",
      sessionTitle: "Easy Lauf",
      planDescription: "5:00–5:20/km",
      laps: null,
    });
    // Falls through to pace_only since no HR and not interval
    expect(result?.model).toBe("pace_only");
  });

  test("interval detected but < 2 effort segments — interval model without misleading pace_only", () => {
    const singleLap: WorkoutLap[] = [
      { distanceMeters: 2000, durationSeconds: 500, avgPaceSecPerKm: 250 },
    ];
    const result = analyzeIntensity({
      ...BASE,
      sessionType: "interval",
      planDescription: "5×2000m @ 4:10",
      laps: singleLap,
    });
    expect(result?.model).toBe("interval");
    expect(result?.signalSource).toBe("insufficient_data");
    expect(result).not.toBeNull();
  });

  test("interval with no lap data: extract returns null — interval branch, never session pace_only", () => {
    const result = analyzeIntensity({
      ...BASE,
      sessionType: "interval",
      planDescription: "5×2000m @ 4:10",
      laps: null,
      gpsStream: null,
      splits: null,
    });
    expect(result).not.toBeNull();
    expect(result?.model).toBe("interval");
    expect(result?.signalSource).toBe("insufficient_data");
  });
});

// ---------------------------------------------------------------------------
// buildCoachFeedback — interval messages
// ---------------------------------------------------------------------------

describe("buildCoachFeedback — interval messages", () => {
  function makeL2(
    score: number,
    meta: IntervalMeta | undefined,
  ): Parameters<typeof buildCoachFeedback>[0] {
    return {
      level: 2,
      effortRatio: 1.0,
      load: 60,
      intensityScore: score,
      classification: "on_target",
      model: "interval",
      signalSource: "interval_segments",
      confidence: 0.9,
      intervalMeta: meta,
    };
  }

  test("perfect execution: correct German message", () => {
    const l2 = makeL2(95, {
      completedReps: 5,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10,
      paceFadeDetected: false,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/perfekt/i);
    expect(fb?.action).toBe("maintain");
  });

  test("pace fade message", () => {
    const l2 = makeL2(72, {
      completedReps: 5,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10 + 8,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10 + 18,
      paceFadeDetected: true,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/Abfall/i);
  });

  test("missing 1 rep, on pace", () => {
    const l2 = makeL2(75, {
      completedReps: 4,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10 + 2,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10 + 5,
      paceFadeDetected: false,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/1 Wiederholung/);
  });

  test("missing 3+ reps, on pace → reduce_load action", () => {
    const l2 = makeL2(55, {
      completedReps: 2,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10 + 5,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10 + 8,
      paceFadeDetected: false,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.action).toBe("reduce_load");
    expect(fb?.message).toMatch(/2\/5/);
  });

  test("all reps, pace well off target", () => {
    const l2 = makeL2(50, {
      completedReps: 5,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10 + 40,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10 + 35,
      slowestRepPace: TARGET_4_10 + 45,
      paceFadeDetected: false,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/Zielpace/i);
  });

  test("no lap structure: extractionStrategy none → Lap message", () => {
    const l2 = makeL2(60, {
      completedReps: 0,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10,
      paceFadeDetected: false,
      extractionStrategy: "none",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/Lap-Taste/i);
  });

  test("gps_stream extractionStrategy → same Lap/Gerät advisory as none", () => {
    const l2 = makeL2(70, {
      completedReps: 5,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10,
      paceFadeDetected: false,
      extractionStrategy: "gps_stream",
    });
    const fb = buildCoachFeedback(l2, null);
    expect(fb?.message).toMatch(/Lap-Taste/i);
  });

  test("global avg pace never appears in interval feedback", () => {
    // 5:08/km global avg would appear as 308 s/km
    const l2 = makeL2(92, {
      completedReps: 5,
      targetReps: 5,
      avgIntervalPace: TARGET_4_10,
      targetPace: TARGET_4_10,
      fastestRepPace: TARGET_4_10,
      slowestRepPace: TARGET_4_10,
      paceFadeDetected: false,
      extractionStrategy: "laps",
    });
    const fb = buildCoachFeedback(l2, null);
    // The misleading "5:08" global avg must not appear
    expect(fb?.message).not.toMatch(/5:08/);
    expect(fb?.message).not.toMatch(/308/);
  });
});

// ---------------------------------------------------------------------------
// Strategy F — structure-aware fallback (no laps / GPS / splits)
// ---------------------------------------------------------------------------

describe("Strategy F: structure-estimated interval pace", () => {
  const planDesc = "2km WU · 8×1km @ 4:10/km (90s Pause) · 2km easy · 2km CD";

  test("estimates interval pace from total duration and parsed structure", () => {
    const parsed = parseStructuredWorkoutSpecFromDesc(planDesc);
    expect(parsed).not.toBeNull();
    const structured = parsed!.workout;

    // Non-interval ≈ 2730s → interval block 2000s for 8km → 250 s/km (4:10)
    const totalDurationSec = 4730;
    const result = extractIntervalMetrics(
      null,
      null,
      null,
      planDesc,
      undefined,
      { totalDurationSec, structuredWorkout: structured },
    );

    expect(result.extraction?.extractionStrategy).toBe("structure_estimated");
    expect(result.avgPaceSecPerKm).not.toBeNull();
    expect(result.avgPaceSecPerKm!).toBeGreaterThanOrEqual(180);
    expect(result.avgPaceSecPerKm!).toBeLessThanOrEqual(360);
    expect(Math.round(result.avgPaceSecPerKm!)).toBe(250);
    expect(result.intensityScore).not.toBeNull();
  });

  test("rejects pace outside 3:00–6:00/km band", () => {
    const parsed = parseStructuredWorkoutSpecFromDesc(planDesc);
    const result = extractIntervalMetrics(null, null, null, planDesc, undefined, {
      totalDurationSec: 2000,
      structuredWorkout: parsed!.workout,
    });
    expect(result.extraction).toBeNull();
    expect(result.avgPaceSecPerKm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: non-interval workouts are completely unaffected
// ---------------------------------------------------------------------------

describe("non-interval workouts: zero changes to standard scoring", () => {
  test("easy run with HR — standard heart_rate model", () => {
    const result = analyzeIntensity({
      durationMinutes: 60,
      actualHrBpm: 140,
      expectedHrBpm: 140,
      actualPaceSecPerKm: 320,
      plannedPaceSecPerKm: { min: 310, max: 340 },
      sessionType: "easy",
      sessionTitle: "Lockerer Lauf",
      planDescription: "5:10–5:40/km",
      laps: null,
    });
    expect(result?.model).toBe("heart_rate");
    expect(result?.intensityScore).toBeGreaterThan(0);
  });

  test("long run with pace-only — standard pace_only model", () => {
    const result = analyzeIntensity({
      durationMinutes: 120,
      actualHrBpm: null,
      expectedHrBpm: null,
      actualPaceSecPerKm: 330,
      plannedPaceSecPerKm: { min: 320, max: 350 },
      sessionType: "long",
      sessionTitle: "Langer Lauf",
      planDescription: "5:20–5:50/km",
    });
    expect(result?.model).toBe("pace_only");
  });

  test("continuous tempo keyword does not break — standard path if not interval type", () => {
    const result = analyzeIntensity({
      durationMinutes: 45,
      actualHrBpm: null,
      expectedHrBpm: null,
      actualPaceSecPerKm: 270,
      plannedPaceSecPerKm: { min: 260, max: 280 },
      sessionType: "tempo",
      sessionTitle: "40min continuous",
      planDescription: "4:30/km",
      laps: null,
      splits: null,
      gpsStream: null,
    });
    expect(result?.model).toBe("pace_only");
  });

  test("non-interval preserves existing score formula", () => {
    // Identical inputs to existing analyzeIntensity tests
    const result = analyzeIntensity({
      durationMinutes: 60,
      actualHrBpm: 84,
      expectedHrBpm: 100,
      actualPaceSecPerKm: null,
      plannedPaceSecPerKm: null,
      // no sessionType / no laps
    });
    expect(result?.classification).toBe("too_easy");
    expect(result?.model).toBe("heart_rate");
  });
});
