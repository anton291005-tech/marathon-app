import { getRecoveryDomainState } from "./recoveryDomainState";
import type { PlanWeek } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "./recoveryStorage";

const minimalPlan: PlanWeek[] = [
  {
    wn: 1,
    phase: "MINI",
    km: 30,
    label: "W1",
    dates: "1.–7. Apr",
    s: [
      { id: "x1", day: "Mo", date: "6. Apr", type: "easy", title: "E", km: 8 },
      { id: "x2", day: "Di", date: "7. Apr", type: "rest", title: "R", km: 0 },
    ],
  },
];

function versionBundle(args: {
  logs: Record<string, unknown>;
  recoveryDailyRows: RecoveryDailyRow[];
  plan: PlanWeek[];
  planFingerprint: string;
}) {
  const wf = recoveryWorkoutsVersionFingerprint(args.logs as never);
  const hf = recoveryHealthVersionFingerprint(args.recoveryDailyRows);
  const v = recoverySnapshotVersionHash({
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: args.planFingerprint,
  });
  return { wf, hf, v };
}

describe("getRecoveryDomainState", () => {
  it("returns initial (no numeric score) when there is not enough real data yet", () => {
    const logs = {};
    const recoveryDailyRows: RecoveryDailyRow[] = [];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, plan: minimalPlan, planFingerprint: pf });
    const s = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: "2026-04-20",
      homeScoreByDay: {},
      snapshotVersion: v,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: false,
    });
    expect(s.domainKind).toBe("initial");
    expect(s.isInsufficient).toBe(false);
    expect(s.homeRecoveryScore0_100).toBeNull();
    expect(s.homeRecoveryBreakdown).toBeNull();
  });

  it("returns insufficient when snapshot and input versions diverge (after init)", () => {
    const logs = {};
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: "2026-04-14", sleepHours: 7.3, hrvMs: 50, restingHr: 52 },
      { date: "2026-04-15", sleepHours: 7.1, hrvMs: 49, restingHr: 53 },
      { date: "2026-04-16", sleepHours: 7.0, hrvMs: 47, restingHr: 54 },
      { date: "2026-04-17", sleepHours: 7.4, hrvMs: 48, restingHr: 52 },
      { date: "2026-04-18", sleepHours: 6.9, hrvMs: 46, restingHr: 55 },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, plan: minimalPlan, planFingerprint: pf });
    const s = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: "2026-04-20",
      homeScoreByDay: {},
      snapshotVersion: `${v}-stale`,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });
    expect(s.domainKind).toBe("insufficient");
    expect(s.isInsufficient).toBe(true);
  });

  it("returns insufficient when there is min data but physio gate fails", () => {
    const logs = {};
    // >=5 days of some health rows (min data), but without enough sleep days in the last 7 (physio gate fail)
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: "2026-04-11", restingHr: 53 },
      { date: "2026-04-12", hrvMs: 48 },
      { date: "2026-04-13", restingHr: 54 },
      { date: "2026-04-14", hrvMs: 47 },
      { date: "2026-04-15", restingHr: 55 },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, plan: minimalPlan, planFingerprint: pf });
    const s = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: "2026-04-20",
      homeScoreByDay: {},
      snapshotVersion: v,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });
    expect(s.domainKind).toBe("insufficient");
    expect(s.isInsufficient).toBe(true);
    expect(s.homeRecoveryScore0_100).toBeNull();
    expect(s.homeRecoveryBreakdown).toBeNull();
  });

  it("returns insufficient when calendar is misaligned (min data present)", () => {
    const logs = {};
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: "2026-04-14", sleepHours: 7.3, hrvMs: 50, restingHr: 52 },
      { date: "2026-04-15", sleepHours: 7.1, hrvMs: 49, restingHr: 53 },
      { date: "2026-04-16", sleepHours: 7.0, hrvMs: 47, restingHr: 54 },
      { date: "2026-04-17", sleepHours: 7.4, hrvMs: 48, restingHr: 52 },
      { date: "2026-04-18", sleepHours: 6.9, hrvMs: 46, restingHr: 55 },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, plan: minimalPlan, planFingerprint: pf });
    const s = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: "2030-06-01",
      homeScoreByDay: {},
      snapshotVersion: v,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });
    expect(s.domainKind).toBe("insufficient");
    expect(s.isInsufficient).toBe(true);
  });
});
