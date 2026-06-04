import type { StoredHealthRun } from "../../healthRuns";
import type { PlanWeek } from "../../marathonPrediction";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "../../recovery/recoveryStorage";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import { summarizeAiContextForDebug } from "./aiContextDebug";
import {
  getAiContext,
  sliceLogsLast30Days,
  sortAiPlanSessionsByCalendar,
  sortStoredHealthRunsForAiContext,
  toRemoteCoachPayload,
} from "./getAiContext";
import { toAiPlanWeeks } from "./planToAi";

function minimalRecovery(now: Date, rawPlan: PlanWeek[], logs: Record<string, unknown>) {
  const pf = JSON.stringify([]) + "|wIdx=0";
  const wf = recoveryWorkoutsVersionFingerprint(logs as any);
  const hf = recoveryHealthVersionFingerprint([]);
  const v = recoverySnapshotVersionHash({
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
  });
  return getRecoveryDomainState({
    now,
    plan: rawPlan,
    logs: logs as any,
    recoveryDailyRows: [],
    loadStressIdx: 2,
    todayCalendarYmd: "2026-04-06",
    homeScoreByDay: {},
    snapshotVersion: v,
    recoveryInputVersion: v,
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
    bootPhaseComplete: true,
  });
}

describe("getAiContext input stabilization", () => {
  const now = new Date(2026, 3, 6, 12, 0, 0);

  it("sortAiPlanSessionsByCalendar orders by date then id", () => {
    const s = sortAiPlanSessionsByCalendar([
      { id: "b", day: "Sa", date: "10. Apr", type: "easy", title: "", km: 5 },
      { id: "a", day: "Mi", date: "8. Apr", type: "easy", title: "", km: 5 },
    ]);
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("sortStoredHealthRunsForAiContext is stable regardless of source array order", () => {
    const a: StoredHealthRun = {
      runId: "z",
      startDate: "2026-04-10T10:00:00.000Z",
      duration: 3600,
      distanceMeters: null,
      distanceUnknown: true,
    };
    const b: StoredHealthRun = {
      runId: "a",
      startDate: "2026-04-11T08:00:00.000Z",
      duration: 3600,
      distanceMeters: null,
      distanceUnknown: true,
    };
    expect(sortStoredHealthRunsForAiContext([a, b]).map((r) => r.runId)).toEqual(
      sortStoredHealthRunsForAiContext([b, a]).map((r) => r.runId),
    );
  });

  it("reverse healthRuns input yields identical remote coach health slice order", () => {
    const rawPlan: PlanWeek[] = [
      {
        wn: 1,
        phase: "MINI",
        label: "W1",
        dates: "",
        km: 20,
        s: [{ id: "s1", day: "Mo", date: "6. Apr", type: "easy", title: "", km: 5 }],
      },
    ];
    const logs: Record<string, unknown> = {};
    const domain = minimalRecovery(now, rawPlan, logs);
    const planAi = toAiPlanWeeks(rawPlan);
    const r1: StoredHealthRun = {
      runId: "z",
      startDate: "2026-04-08T10:00:00.000Z",
      duration: 100,
      distanceMeters: null,
      distanceUnknown: true,
    };
    const r2: StoredHealthRun = {
      runId: "a",
      startDate: "2026-04-09T08:00:00.000Z",
      duration: 100,
      distanceMeters: null,
      distanceUnknown: true,
    };

    const partial = {
      plan: planAi,
      logs,
      now,
      recoveryDomain: domain,
      availableScreens: [{ key: "home", label: "Start" }],
    };

    const remoteA = toRemoteCoachPayload(getAiContext({ ...partial, healthRuns: [r1, r2] }));
    const remoteB = toRemoteCoachPayload(getAiContext({ ...partial, healthRuns: [r2, r1] }));

    expect(JSON.stringify(remoteA.healthRunsLast30Days)).toEqual(JSON.stringify(remoteB.healthRunsLast30Days));
  });

  it("sliceLogsLast30Days ignores object key insertion order", () => {
    const rawPlan: PlanWeek[] = [
      {
        wn: 1,
        phase: "MINI",
        label: "W1",
        dates: "",
        km: 20,
        s: [
          { id: "sx", day: "So", date: "6. Apr", type: "easy", title: "", km: 5 },
          { id: "sy", day: "So", date: "6. Apr", type: "interval", title: "", km: 5 },
        ],
      },
    ];
    const planAi = toAiPlanWeeks(rawPlan);
    const logsEarly: Record<string, unknown> = { sx: { done: true }, sy: { done: false } };
    const logsLate: Record<string, unknown> = { sy: { done: false }, sx: { done: true } };
    const base = minimalRecovery(now, rawPlan, logsEarly);

    const sliceA = sliceLogsLast30Days(
      getAiContext({
        plan: planAi,
        logs: logsEarly as any,
        now,
        recoveryDomain: base,
        availableScreens: [{ key: "home", label: "Start" }],
      }),
    );
    const sliceB = sliceLogsLast30Days(
      getAiContext({
        plan: planAi,
        logs: logsLate as any,
        now,
        recoveryDomain: base,
        availableScreens: [{ key: "home", label: "Start" }],
      }),
    );

    expect(JSON.stringify(sliceA)).toEqual(JSON.stringify(sliceB));
  });

  it("summarizeAiContextForDebug matches for identical snapshots", () => {
    const rawPlan: PlanWeek[] = [
      {
        wn: 1,
        phase: "MINI",
        label: "W1",
        dates: "",
        km: 20,
        s: [{ id: "s1", day: "Mo", date: "6. Apr", type: "easy", title: "", km: 5 }],
      },
    ];
    const logs: Record<string, unknown> = {};
    const domain = minimalRecovery(now, rawPlan, logs);
    const planAi = toAiPlanWeeks(rawPlan);
    const ctx = getAiContext({
      plan: planAi,
      logs: logs as any,
      now,
      recoveryDomain: domain,
      availableScreens: [{ key: "home", label: "Start" }],
    });
    expect(summarizeAiContextForDebug(ctx)).toEqual(summarizeAiContextForDebug(ctx));
  });
});
