import { buildBoostNextWeekVolumePatches, buildTaperWindowPatches, isoDateLocalNoon } from "./coachPlanMutations";
import type { AiContext } from "./types";
import { toAiPlanWeeks } from "./planToAi";
import type { PlanWeek } from "../../marathonPrediction";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "../../recovery/recoveryStorage";
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

function ctxFor(planRaw: PlanWeek[], todayIso: string, overrides?: Partial<AiContext>): AiContext {
  const logs = {};
  const pf = JSON.stringify([]);
  const wf = recoveryWorkoutsVersionFingerprint(logs);
  const hf = recoveryHealthVersionFingerprint([]);
  const v = recoverySnapshotVersionHash({ workoutsFingerprint: wf, healthFingerprint: hf, planFingerprint: pf });
  const recoveryDomain = getRecoveryDomainState({
    now: new Date(todayIso),
    plan: planRaw,
    logs,
    recoveryDailyRows: [],
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
    raceDateIso: null,
    maxHeartRateBpm: 185,
    healthRuns: [],
    goals: { targetTime: "3:05:00" },
    logs,
    plan: toAiPlanWeeks(planRaw),
    next14Days: [],
    availableScreens: [],
    recoveryDomain,
    recoverySummary: buildRecoverySummaryFromDomain(recoveryDomain),
    ...(overrides || {}),
  };
}

describe("buildTaperWindowPatches", () => {
  test("uses override race anchor even without plan raceDateIso", () => {
    const plan = makePlan([
      { id: "iv", date: "12. Mai", day: "Di", type: "interval", title: "IV", km: 12 },
      { id: "easy1", date: "13. Mai", day: "Mi", type: "easy", title: "E", km: 10 },
    ]);
    const today = new Date("2026-05-03T08:00:00").toISOString();
    const anchor = new Date(2026, 4, 13, 12, 0, 0);
    const ctx = ctxFor(plan, today, { raceDateIso: null });
    const r = buildTaperWindowPatches(ctx, isoDateLocalNoon(anchor));
    expect(r.patches.length).toBeGreaterThan(0);
    expect(r.summaryLine).toMatch(/angepasst/);
  });

  test("flags very short lead time", () => {
    const plan = makePlan([
      { id: "e1", date: "4. Mai", day: "Mo", type: "easy", title: "E", km: 10 },
      { id: "e2", date: "5. Mai", day: "Di", type: "easy", title: "E2", km: 8 },
    ]);
    const today = new Date("2026-05-03T08:00:00").toISOString();
    const race = new Date(2026, 4, 5, 12, 0, 0);
    const ctx = ctxFor(plan, today, { raceDateIso: null });
    const r = buildTaperWindowPatches(ctx, isoDateLocalNoon(race));
    expect(r.shortLeadWarning).toMatch(/kurze Vorlaufzeit/i);
  });
});

describe("buildBoostNextWeekVolumePatches", () => {
  function planWithOneTempoNextWeek(): PlanWeek[] {
    return makePlan([{ id: "n1", date: "13. Mai", day: "Mi", type: "tempo", title: "Tempo", km: 10 }]);
  }

  test("negative pct reduces next week's volume instead of flipping to an increase", () => {
    const today = new Date("2026-05-06T08:00:00").toISOString();
    const ctx = ctxFor(planWithOneTempoNextWeek(), today);
    const patches = buildBoostNextWeekVolumePatches(ctx, -20);
    expect(patches).toHaveLength(1);
    expect(patches[0].changes.km).toBe(8);
    expect(patches[0].reason).toMatch(/-20%/);
    expect(patches[0].changes.desc).toMatch(/reduziert/);
  });

  test("positive pct still increases volume as before", () => {
    const today = new Date("2026-05-06T08:00:00").toISOString();
    const ctx = ctxFor(planWithOneTempoNextWeek(), today);
    const patches = buildBoostNextWeekVolumePatches(ctx, 20);
    expect(patches).toHaveLength(1);
    expect(patches[0].changes.km).toBe(12);
    expect(patches[0].reason).toMatch(/\+20%/);
    expect(patches[0].changes.desc).toMatch(/erhöht/);
  });

  test("clamps magnitude to max 35% while preserving sign", () => {
    const today = new Date("2026-05-06T08:00:00").toISOString();
    const ctx = ctxFor(planWithOneTempoNextWeek(), today);
    const reduced = buildBoostNextWeekVolumePatches(ctx, -80);
    const increased = buildBoostNextWeekVolumePatches(ctx, 80);
    expect(reduced[0].changes.km).toBe(6.5);
    expect(increased[0].changes.km).toBe(13.5);
  });
});
