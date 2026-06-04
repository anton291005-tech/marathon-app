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
import { buildRecoverySummaryFromDomain } from "./recoverySummary";

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

  test("TEST 4: elevated resting HR applies fatigue penalty", () => {
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
    const baselineRows = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      restingHr: 50,
      sleepHours: 7.5,
    }));
    const stressRows: Array<{ date: string; restingHr: number; sleepHours: number }> = [];
    for (let day = 28; day <= 31; day++) {
      stressRows.push({ date: `2026-05-${String(day).padStart(2, "0")}`, restingHr: 58, sleepHours: 7.5 });
    }
    for (let day = 1; day <= 10; day++) {
      stressRows.push({ date: `2026-06-${String(day).padStart(2, "0")}`, restingHr: 58, sleepHours: 7.5 });
    }
    const recoveryDailyRows = [...baselineRows, ...stressRows].sort((a, b) => a.date.localeCompare(b.date));
    const ctx = ctxFor(plan, new Date("2026-06-10T12:00:00").toISOString(), { logs, recoveryDailyRows });
    const p = computePaceBasedPrediction(ctx);
    expect(p).not.toBeNull();
    expect(p!.recoveryAdjustmentApplied).toBeLessThanOrEqual(-0.02);
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
});
