import type { AiContext } from "./types";
import { computePaceBasedPrediction } from "./coachRacePrediction";
import type { PlanWeek } from "../../marathonPrediction";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "../../recovery/recoveryStorage";
import { toAiPlanWeeks } from "./planToAi";
import { buildRecoverySummaryFromDomain, type RecoverySummary } from "./recoverySummary";
import { getRecoveryInfluence } from "../../recovery/getRecoveryInfluence";

function makePlan(
  datesessions: Array<{ date: string; day: string; id: string; type: string; title: string; km: number }>,
): PlanWeek[] {
  return [
    {
      wn: 1,
      phase: "TEST",
      label: "Test",
      dates: "Mix",
      km: 99,
      s: datesessions.map((s) => ({
        ...s,
        desc: "",
        pace: null,
      })),
    },
  ];
}

function ctxFor(
  planRaw: PlanWeek[],
  todayIso: string,
  overrides?: Partial<AiContext>,
): AiContext {
  const logs: Record<string, any> = overrides?.logs ?? {};
  const pf = JSON.stringify(planRaw);
  const wf = recoveryWorkoutsVersionFingerprint(logs);
  const hf = recoveryHealthVersionFingerprint(overrides?.recoveryDailyRows ?? []);
  const v = recoverySnapshotVersionHash({ workoutsFingerprint: wf, healthFingerprint: hf, planFingerprint: pf });
  const recoveryDomain = getRecoveryDomainState({
    now: new Date(todayIso),
    plan: planRaw,
    logs,
    recoveryDailyRows: overrides?.recoveryDailyRows ?? [],
    loadStressIdx: 2,
    todayCalendarYmd: todayIso.slice(0, 10),
    homeScoreByDay: {},
    snapshotVersion: v,
    recoveryInputVersion: v,
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
    bootPhaseComplete: true,
  });
  return {
    todayIso,
    raceDateIso: new Date("2026-09-27T12:00:00").toISOString(),
    maxHeartRateBpm: 185,
    healthRuns: overrides?.healthRuns ?? [],
    goals: { targetTime: "3:05:00" },
    logs,
    plan: toAiPlanWeeks(planRaw),
    next14Days: [
      { id: "up-long", day: "So", date: "22. Jun", type: "long", title: "Lang", km: 28 },
    ],
    availableScreens: [],
    recoveryDomain,
    recoveryDailyRows: overrides?.recoveryDailyRows,
    recoverySummary: buildRecoverySummaryFromDomain(recoveryDomain),
    ...(overrides || {}),
  };
}

/** Pace ~5:45/km on 18 km → conservative marathon extrapolation (not Sub-3). */
describe("computePaceBasedPrediction", () => {
  test("TEST 1: four long runs ~5:45/km → not Sub-3h, strong confidence", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const plan = makePlan([
      { id: "lr1", date: "18. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr2", date: "25. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr3", date: "1. Jun", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr4", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 },
    ]);
    const logs = {
      lr1: mkLog("run_lr1"),
      lr2: mkLog("run_lr2"),
      lr3: mkLog("run_lr3"),
      lr4: mkLog("run_lr4"),
    };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.isSubThreeHourTarget).toBe(false);
    expect(p!.gapToSubThreeSeconds).toBeGreaterThan(300);
    expect(p!.confidenceLevel).toBe("high");
    expect(p!.predictedMarathonTimeSeconds).toBeGreaterThan(10800);
    expect(p!.predictedMarathonTimeSeconds).toBeLessThan(18000);
  });

  test("TEST 2: three fast long runs → Sub-3h target", () => {
    const paceSecPerKm = 4 * 60;
    const distKm = 20;
    const duration = paceSecPerKm * distKm;
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const plan = makePlan([
      { id: "a", date: "25. Mai", day: "So", type: "long", title: "L", km: 20 },
      { id: "b", date: "1. Jun", day: "So", type: "long", title: "L", km: 20 },
      { id: "c", date: "8. Jun", day: "So", type: "long", title: "L", km: 20 },
    ]);
    const logs = { a: mkLog("run_a"), b: mkLog("run_b"), c: mkLog("run_c") };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.isSubThreeHourTarget).toBe(true);
    expect(p!.confidenceLevel).toBe("medium");
    expect(p!.gapToSubThreeSeconds).toBeLessThan(0);
  });

  test("TEST 3: long + tempo → combined method", () => {
    const longPace = 4 * 60 + 20;
    const longDist = 20;
    const longDur = longPace * longDist;
    const tempoPace = 3 * 60 + 50;
    const tempoDist = 10;
    const tempoDur = tempoPace * tempoDist;
    const plan = makePlan([
      { id: "l1", date: "25. Mai", day: "So", type: "long", title: "L", km: 20 },
      { id: "l2", date: "1. Jun", day: "So", type: "long", title: "L", km: 20 },
      { id: "l3", date: "8. Jun", day: "So", type: "long", title: "L", km: 20 },
      { id: "t1", date: "27. Mai", day: "Mi", type: "tempo", title: "T", km: 10 },
      { id: "t2", date: "3. Jun", day: "Mi", type: "tempo", title: "T", km: 10 },
      { id: "t3", date: "6. Jun", day: "Sa", type: "interval", title: "I", km: 10 },
    ]);
    const logs = {
      l1: { done: true, assignedRun: { runId: "hl1", startDate: "s", duration: longDur, distanceKm: longDist } },
      l2: { done: true, assignedRun: { runId: "hl2", startDate: "s", duration: longDur, distanceKm: longDist } },
      l3: { done: true, assignedRun: { runId: "hl3", startDate: "s", duration: longDur, distanceKm: longDist } },
      t1: { done: true, assignedRun: { runId: "ht1", startDate: "s", duration: tempoDur, distanceKm: tempoDist } },
      t2: { done: true, assignedRun: { runId: "ht2", startDate: "s", duration: tempoDur, distanceKm: tempoDist } },
      t3: { done: true, assignedRun: { runId: "ht3", startDate: "s", duration: tempoDur, distanceKm: tempoDist } },
    };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.primaryMethod).toBe("combined");
    expect(p!.predictedMarathonTimeSeconds).toBeGreaterThan(0);
  });

  test("TEST 4a: low recoverySummary applies continuous fatigue adjustment (SSOT-sourced)", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const plan = makePlan([
      { id: "lr1", date: "18. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr2", date: "25. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr3", date: "1. Jun", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr4", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 },
    ]);
    const logs = {
      lr1: mkLog("r1"),
      lr2: mkLog("r2"),
      lr3: mkLog("r3"),
      lr4: mkLog("r4"),
    };
    const lowRecoverySummary: RecoverySummary = {
      avgRecovery: 20,
      avgConfidence: 0.9,
      influenceWeight: getRecoveryInfluence(1, 0.9),
      dominantSource: "physio",
    };
    const ctxNeutral = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const ctxLowRecovery = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), {
      logs,
      recoverySummary: lowRecoverySummary,
    });
    const pNeutral = computePaceBasedPrediction(ctxNeutral);
    const pLow = computePaceBasedPrediction(ctxLowRecovery);
    expect(pNeutral).not.toBeNull();
    expect(pLow).not.toBeNull();
    // Bad recovery (avgRecovery < 50) must slow the prediction down (positive adjustment, longer time).
    expect(pLow!.recoveryAdjustmentApplied).toBeGreaterThan(0);
    expect(pLow!.recoveryAdjustmentApplied).toBeLessThanOrEqual(0.03);
    expect(pLow!.predictedMarathonTimeSeconds).toBeGreaterThan(pNeutral!.predictedMarathonTimeSeconds);
    expect(pLow!.interpretation).toMatch(/Recovery-Score 20\/100/);
  });

  test("TEST 4b: high recoverySummary applies continuous performance bonus", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const plan = makePlan([
      { id: "lr1", date: "18. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr2", date: "25. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr3", date: "1. Jun", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr4", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 },
    ]);
    const logs = {
      lr1: mkLog("r1"),
      lr2: mkLog("r2"),
      lr3: mkLog("r3"),
      lr4: mkLog("r4"),
    };
    const highRecoverySummary: RecoverySummary = {
      avgRecovery: 90,
      avgConfidence: 0.9,
      influenceWeight: getRecoveryInfluence(1, 0.9),
      dominantSource: "physio",
    };
    const ctxNeutral = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const ctxHighRecovery = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), {
      logs,
      recoverySummary: highRecoverySummary,
    });
    const pNeutral = computePaceBasedPrediction(ctxNeutral);
    const pHigh = computePaceBasedPrediction(ctxHighRecovery);
    expect(pNeutral).not.toBeNull();
    expect(pHigh).not.toBeNull();
    expect(pHigh!.recoveryAdjustmentApplied).toBeLessThan(0);
    expect(pHigh!.recoveryAdjustmentApplied).toBeGreaterThanOrEqual(-0.03);
    expect(pHigh!.predictedMarathonTimeSeconds).toBeLessThan(pNeutral!.predictedMarathonTimeSeconds);
  });

  test("TEST 4c: missing recoverySummary is neutral (no adjustment)", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const plan = makePlan([
      { id: "lr1", date: "18. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr2", date: "25. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr3", date: "1. Jun", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr4", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 },
    ]);
    const logs = {
      lr1: mkLog("r1"),
      lr2: mkLog("r2"),
      lr3: mkLog("r3"),
      lr4: mkLog("r4"),
    };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs, recoverySummary: undefined });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.recoveryAdjustmentApplied).toBe(0);
  });

  test("TEST 5: only one long run → null", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const plan = makePlan([{ id: "lr1", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 }]);
    const logs = {
      lr1: { done: true, assignedRun: { runId: "x", startDate: "s", duration, distanceKm: distKm } },
    };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    expect(computePaceBasedPrediction(ctx)).toBeNull();
  });

  test("TEST 6: German interpretation shows pace and clock time", () => {
    const paceSecPerKm = 5 * 60 + 45;
    const distKm = 18;
    const duration = paceSecPerKm * distKm;
    const plan = makePlan([
      { id: "lr1", date: "18. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr2", date: "25. Mai", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr3", date: "1. Jun", day: "So", type: "long", title: "L", km: 18 },
      { id: "lr4", date: "8. Jun", day: "So", type: "long", title: "L", km: 18 },
    ]);
    const mkLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: `${id}_start`, duration, distanceKm: distKm },
    });
    const logs = { lr1: mkLog("a"), lr2: mkLog("b"), lr3: mkLog("c"), lr4: mkLog("d") };
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.interpretation).toMatch(/\/km/);
    expect(p!.interpretation).toMatch(/\d+:\d{2}:\d{2}/);
  });

  test("TEST 7: tempo duration staggers the marathon-pace factor", () => {
    const longPaceSecPerKm = 4 * 60 + 20;
    const longDist = 20;
    const longDur = longPaceSecPerKm * longDist;
    const mkLongLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: "s", duration: longDur, distanceKm: longDist },
    });
    const tempoPaceSecPerKm = 3 * 60 + 50;

    function buildCtx(tempoDistKm: number) {
      const tempoDur = tempoPaceSecPerKm * tempoDistKm;
      const plan = makePlan([
        { id: "l1", date: "25. Mai", day: "So", type: "long", title: "L", km: 20 },
        { id: "l2", date: "1. Jun", day: "So", type: "long", title: "L", km: 20 },
        { id: "t1", date: "3. Jun", day: "Mi", type: "tempo", title: "T", km: tempoDistKm },
      ]);
      const logs = {
        l1: mkLongLog("hl1"),
        l2: mkLongLog("hl2"),
        t1: { done: true, assignedRun: { runId: "ht1", startDate: "s", duration: tempoDur, distanceKm: tempoDistKm } },
      };
      return ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    }

    const pShortTempo = computePaceBasedPrediction(buildCtx(3)); // ~11.5min → short bucket, factor 1.10
    const pLongTempo = computePaceBasedPrediction(buildCtx(12)); // ~46min → long bucket, factor 1.20
    expect(pShortTempo).not.toBeNull();
    expect(pLongTempo).not.toBeNull();
    expect(pShortTempo!.primaryMethod).toBe("combined");
    expect(pLongTempo!.primaryMethod).toBe("combined");
    // Same tempo pace, but a longer tempo effort maps to a larger (slower) marathon-pace factor.
    expect(pLongTempo!.predictedMarathonTimeSeconds).toBeGreaterThan(pShortTempo!.predictedMarathonTimeSeconds);
  });

  test("TEST 8: tempo blend weight increases with sample count in the tempo window", () => {
    const longPaceSecPerKm = 4 * 60 + 20;
    const longDist = 20;
    const longDur = longPaceSecPerKm * longDist;
    const mkLongLog = (id: string) => ({
      done: true,
      assignedRun: { runId: id, startDate: "s", duration: longDur, distanceKm: longDist },
    });
    const tempoPaceSecPerKm = 3 * 60 + 30;
    const tempoDistKm = 8; // 8*220s = 1760s ≈ 29min → medium bucket, factor constant across scenarios

    function buildCtx(tempoSampleCount: number) {
      const tempoDates = ["27. Mai", "29. Mai", "3. Jun", "5. Jun"].slice(0, tempoSampleCount);
      const tempoSessions = tempoDates.map((date, i) => ({
        id: `t${i + 1}`,
        date,
        day: "Mi",
        type: "tempo",
        title: "T",
        km: tempoDistKm,
      }));
      const plan = makePlan([
        { id: "l1", date: "25. Mai", day: "So", type: "long", title: "L", km: 20 },
        { id: "l2", date: "1. Jun", day: "So", type: "long", title: "L", km: 20 },
        ...tempoSessions,
      ]);
      const logs: Record<string, any> = { l1: mkLongLog("hl1"), l2: mkLongLog("hl2") };
      tempoSessions.forEach((s, i) => {
        logs[s.id] = {
          done: true,
          assignedRun: {
            runId: `ht${i + 1}`,
            startDate: "s",
            duration: tempoPaceSecPerKm * tempoDistKm,
            distanceKm: tempoDistKm,
          },
        };
      });
      return ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs });
    }

    const pOneSample = computePaceBasedPrediction(buildCtx(1));
    const pFourSamples = computePaceBasedPrediction(buildCtx(4));
    expect(pOneSample).not.toBeNull();
    expect(pFourSamples).not.toBeNull();
    // Tempo pace here is faster than the long-run-implied marathon pace, so more tempo
    // samples (more weight) must pull the blended prediction toward the faster tempo time.
    expect(pFourSamples!.predictedMarathonTimeSeconds).toBeLessThan(pOneSample!.predictedMarathonTimeSeconds);
  });
});
