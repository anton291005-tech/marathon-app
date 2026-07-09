import { computeHomeRecoveryScore, computeHomeRecoveryScoreBreakdown, computeHomeRecoveryScoreFromInputs } from "./homeRecoveryScore";
import { buildPlanWeekToDateMap, computeDailyRecoverySeries } from "./recoveryScoringEngine";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";

function buildSeriesFixture() {
  const rows: RecoveryDailyRow[] = [
    { date: "2026-04-14", sleepHours: 7.2, hrvMs: 52, restingHr: 54 },
    { date: "2026-04-15", sleepHours: 6.8, hrvMs: 48, restingHr: 56 },
    { date: "2026-04-16", sleepHours: 7.6, hrvMs: 55, restingHr: 53 },
    { date: "2026-04-17", sleepHours: 7.1, hrvMs: 50, restingHr: 55 },
    { date: "2026-04-18", sleepHours: 6.9, hrvMs: 47, restingHr: 57 },
    { date: "2026-04-19", sleepHours: 7.4, hrvMs: 54, restingHr: 54 },
    { date: "2026-04-20", sleepHours: 7.0, hrvMs: 49, restingHr: 56 },
  ];
  const plan: PlanWeek[] = [
    {
      wn: 1,
      phase: "TEST",
      km: 0,
      s: [{ id: "x", day: "Mo", date: "14. Apr", type: "rest", title: "R", km: 0 }],
    } as PlanWeek,
  ];
  const logs: Record<string, SessionLog> = {};
  const now = new Date("2026-04-20T12:00:00");
  const map = buildPlanWeekToDateMap(plan);
  const { series } = computeDailyRecoverySeries(rows, map, plan, logs, now);
  return { series, plan, logs, now };
}

describe("computeHomeRecoveryScore", () => {
  it("returns null when required inputs missing", () => {
    expect(
      computeHomeRecoveryScoreFromInputs({
        sleepHours: null,
        hrvMs: 50,
        restingHr: null,
        activeEnergyKcal: null,
      }),
    ).toBeNull();
    expect(
      computeHomeRecoveryScoreFromInputs({
        sleepHours: 7,
        hrvMs: null,
        restingHr: null,
        activeEnergyKcal: 500,
      }),
    ).toBeNull();
  });

  it("returns deterministic score for same inputs", () => {
    const inputs = { sleepHours: 7.2, hrvMs: 52, restingHr: null, activeEnergyKcal: 420 };
    const a = computeHomeRecoveryScoreFromInputs(inputs);
    const b = computeHomeRecoveryScoreFromInputs(inputs);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("computeHomeRecoveryScore returns a deterministic numeric score for a given series", () => {
    const { series, plan, logs, now } = buildSeriesFixture();
    const a = computeHomeRecoveryScore({ series, plan, logs, now });
    const b = computeHomeRecoveryScore({ series, plan, logs, now });
    expect(typeof a.score).toBe("number");
    expect(a.score).toBe(b.score);
  });

  it("breakdown score matches computeHomeRecoveryScore", () => {
    const { series, plan, logs, now } = buildSeriesFixture();
    const a = computeHomeRecoveryScore({ series, plan, logs, now });
    const b = computeHomeRecoveryScoreBreakdown({ series, plan, logs, now });
    expect(b.score).toBe(a.score);
  });

  // Note: no cold-start blending, inertia, or clamp guards in strict mode.
});
