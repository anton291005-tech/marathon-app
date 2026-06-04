import { getRecoveryDomainState } from "./recoveryDomainState";
import { getRecoveryPresentationState } from "./recoveryPresentation";
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
    s: [{ id: "x1", day: "Mo", date: "6. Apr", type: "easy", title: "E", km: 8 }],
  },
];

function versionBundle(args: {
  logs: Record<string, unknown>;
  recoveryDailyRows: RecoveryDailyRow[];
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

describe("Recovery pipeline integration (domain → presentation → both cards)", () => {
  it("valid same-day inputs → numeric score shown consistently on Home + Leistung view-models", () => {
    const logs = {};
    const todayYmd = "2026-04-20";
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: todayYmd, sleepHours: 7.2, hrvMs: 52, restingHr: undefined, activeEnergyKcal: 420 },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, planFingerprint: pf });

    // Force a gate failure to ensure KPI still reaches UI when inputs are valid.
    const domain = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: todayYmd,
      homeScoreByDay: {},
      snapshotVersion: `${v}-stale`,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });

    expect(domain.isInsufficient).toBe(false);
    expect(domain.homeRecoveryScore0_100).not.toBeNull();
    expect(typeof domain.homeRecoveryScore0_100).toBe("number");

    const pres = getRecoveryPresentationState(domain, 0);

    // "Home card" binding
    expect(pres.homeKpi.score0_100).toBe(domain.homeRecoveryScore0_100);
    expect(pres.homeKpi.scoreDisplay).toBe(String(domain.homeRecoveryScore0_100));

    // "Leistung card" binding (Verlauf header)
    expect(pres.verlauf.header.score).toBe(domain.homeRecoveryScore0_100);
  });

  it("same-day missing but >=3 valid days in last 7 → fallback7d score is used and shown", () => {
    const logs = {};
    const todayYmd = "2026-04-20";
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: "2026-04-14", sleepHours: 7.2, hrvMs: 55, restingHr: undefined, activeEnergyKcal: 500 },
      { date: "2026-04-16", sleepHours: 6.8, hrvMs: undefined, restingHr: 54, activeEnergyKcal: 650 },
      { date: "2026-04-18", sleepHours: 7.5, hrvMs: 52, restingHr: undefined, activeEnergyKcal: 400 },
      // today row exists but missing required fields -> Layer 1 null
      { date: todayYmd, sleepHours: undefined, hrvMs: undefined, restingHr: undefined },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, planFingerprint: pf });

    const domain = getRecoveryDomainState({
      recoveryDayKey: `u1:${todayYmd}`,
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: todayYmd,
      homeScoreByDay: {},
      snapshotVersion: `${v}-stale`,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });

    expect(domain.homeRecoveryScoreSource).toBe("fallback7d");
    expect(domain.homeRecoveryScore0_100).not.toBeNull();
    expect(domain.homeRecoveryScore0_100 as number).toBeGreaterThanOrEqual(1);
    expect(domain.homeRecoveryScore0_100 as number).toBeLessThanOrEqual(100);

    const pres = getRecoveryPresentationState(domain, 0);
    expect(pres.homeKpi.scoreDisplay).toBe(String(domain.homeRecoveryScore0_100));
    expect(pres.verlauf.header.score).toBe(domain.homeRecoveryScore0_100);
    expect(pres.verlauf.fallback7d).not.toBeNull();
  });

  it("fallback7d still works when activeEnergyKcal is missing (load defaults to 0 completed sessions)", () => {
    const logs = {};
    const todayYmd = "2026-04-20";
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: "2026-04-14", sleepHours: 7.2, hrvMs: 55, restingHr: undefined },
      { date: "2026-04-16", sleepHours: 6.8, hrvMs: undefined, restingHr: 54 },
      { date: "2026-04-18", sleepHours: 7.5, hrvMs: 52, restingHr: undefined },
      { date: todayYmd },
    ];
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, planFingerprint: pf });

    const domain = getRecoveryDomainState({
      recoveryDayKey: `u1:${todayYmd}`,
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: todayYmd,
      homeScoreByDay: {},
      snapshotVersion: `${v}-stale`,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });

    expect(domain.homeRecoveryScoreSource).toBe("fallback7d");
    expect(domain.homeRecoveryScore0_100).not.toBeNull();
  });

  it("precedence: same-day inputs win even when snapshot/input versions are missing (cache/hydration edge)", () => {
    const logs = {};
    const todayYmd = "2026-04-20";
    const recoveryDailyRows: RecoveryDailyRow[] = [
      { date: todayYmd, sleepHours: 7.0, hrvMs: undefined, restingHr: 55, activeEnergyKcal: 0 },
    ];
    const pf = JSON.stringify(minimalPlan);

    const domain = getRecoveryDomainState({
      recoveryDayKey: `u1:${todayYmd}`,
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: todayYmd,
      homeScoreByDay: {},
      // snapshotVersion / recoveryInputVersion intentionally omitted
      bootPhaseComplete: false,
    });

    expect(domain.isInsufficient).toBe(false);
    expect(domain.homeRecoveryScore0_100).not.toBeNull();
    expect(typeof domain.homeRecoveryScore0_100).toBe("number");

    const pres = getRecoveryPresentationState(domain, 0);
    expect(pres.homeKpi.score0_100).toBe(domain.homeRecoveryScore0_100);
    expect(pres.verlauf.header.score).toBe(domain.homeRecoveryScore0_100);
  });

  it("missing physio inputs today → both cards still show a numeric load-only score", () => {
    const logs = {};
    const todayYmd = "2026-04-20";
    const recoveryDailyRows: RecoveryDailyRow[] = [{ date: todayYmd, hrvMs: 50 }]; // missing sleepHours
    const pf = JSON.stringify(minimalPlan);
    const { wf, hf, v } = versionBundle({ logs, recoveryDailyRows, planFingerprint: pf });

    const domain = getRecoveryDomainState({
      now: new Date("2026-04-20T12:00:00"),
      plan: minimalPlan,
      logs,
      recoveryDailyRows,
      loadStressIdx: 2,
      todayCalendarYmd: todayYmd,
      homeScoreByDay: {},
      snapshotVersion: v,
      recoveryInputVersion: v,
      workoutsFingerprint: wf,
      healthFingerprint: hf,
      planFingerprint: pf,
      bootPhaseComplete: true,
    });

    expect(domain.isInsufficient).toBe(false);
    expect(domain.homeRecoveryScoreSource).toBe("loadOnly");
    expect(domain.homeRecoveryScore0_100).not.toBeNull();

    const pres = getRecoveryPresentationState(domain, 0);
    expect(pres.homeKpi.score0_100).toBe(domain.homeRecoveryScore0_100);
    expect(pres.homeKpi.scoreDisplay).toBe(String(domain.homeRecoveryScore0_100));
    expect(pres.verlauf.header.score).toBe(domain.homeRecoveryScore0_100);
  });
});

