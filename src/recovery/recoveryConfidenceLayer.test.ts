import { buildPlanWeekToDateMap, computeDailyRecoverySeries } from "./recoveryScoringEngine";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

describe("Recovery confidence layer (physio vs load_only)", () => {
  it("physio series has high confidence and source=physio", () => {
    const rows: RecoveryDailyRow[] = [
      { date: "2026-04-01", sleepHours: 7.2, hrvMs: 52, restingHr: 54 },
      { date: "2026-04-02", sleepHours: 6.8, hrvMs: 48, restingHr: 56 },
      { date: "2026-04-03", sleepHours: 7.6, hrvMs: 55, restingHr: 53 },
      { date: "2026-04-04", sleepHours: 7.1, hrvMs: 50, restingHr: 55 },
      { date: "2026-04-05", sleepHours: 6.9, hrvMs: 47, restingHr: 57 },
      { date: "2026-04-06", sleepHours: 7.4, hrvMs: 54, restingHr: 54 },
      { date: "2026-04-07", sleepHours: 7.0, hrvMs: 49, restingHr: 56 },
    ];
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        s: [{ id: "x", day: "Mo", date: "01. Apr", type: "rest", title: "R", km: 0 }],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = {};
    const now = new Date("2026-04-07T12:00:00");
    const map = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries(rows, map, plan, logs, now);

    const last7 = series.slice(-7);
    expect(last7.length).toBeGreaterThanOrEqual(5);
    expect(last7.every((d) => d.source === "physio")).toBe(true);
    expect(mean(last7.map((d) => d.pointConfidence))).toBeGreaterThanOrEqual(0.75);
  });

  it("load-only series has capped confidence and source=load_only", () => {
    const rows: RecoveryDailyRow[] = [];
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        s: [
          { id: "a1", day: "Mo", date: "01. Apr", type: "easy", title: "E", km: 8 },
          { id: "a2", day: "Di", date: "02. Apr", type: "easy", title: "E", km: 8 },
          { id: "a3", day: "Mi", date: "03. Apr", type: "long", title: "L", km: 24 },
          { id: "a4", day: "Do", date: "04. Apr", type: "rest", title: "R", km: 0 },
          { id: "a5", day: "Fr", date: "05. Apr", type: "tempo", title: "T", km: 10 },
          { id: "a6", day: "Sa", date: "06. Apr", type: "rest", title: "R", km: 0 },
          { id: "a7", day: "So", date: "07. Apr", type: "easy", title: "E", km: 6 },
        ],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = {
      a1: { done: true },
      a2: { done: true },
      a3: { done: true },
      a5: { done: true },
      a7: { done: true },
    };
    const now = new Date("2026-04-07T12:00:00");
    const map = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries(rows, map, plan, logs, now);

    const last7 = series.slice(-7);
    expect(last7.length).toBeGreaterThanOrEqual(5);
    expect(last7.every((d) => d.source === "load_only")).toBe(true);
    expect(mean(last7.map((d) => d.pointConfidence))).toBeLessThanOrEqual(0.65);
  });

  it("mixed series contains both sources", () => {
    const rows: RecoveryDailyRow[] = [
      { date: "2026-04-05", sleepHours: 7.1, hrvMs: 50, restingHr: 55 },
      { date: "2026-04-06", sleepHours: 6.9, hrvMs: 48, restingHr: 56 },
    ];
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        s: [
          { id: "m1", day: "Mo", date: "01. Apr", type: "easy", title: "E", km: 8 },
          { id: "m2", day: "Di", date: "02. Apr", type: "easy", title: "E", km: 8 },
          { id: "m3", day: "Mi", date: "03. Apr", type: "long", title: "L", km: 22 },
          { id: "m4", day: "Do", date: "04. Apr", type: "rest", title: "R", km: 0 },
          { id: "m5", day: "Fr", date: "05. Apr", type: "tempo", title: "T", km: 10 },
          { id: "m6", day: "Sa", date: "06. Apr", type: "easy", title: "E", km: 6 },
        ],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = { m1: { done: true }, m2: { done: true }, m3: { done: true }, m5: { done: true }, m6: { done: true } };
    const now = new Date("2026-04-06T12:00:00");
    const map = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries(rows, map, plan, logs, now);

    const sources = new Set(series.map((d) => d.source));
    expect(sources.has("physio")).toBe(true);
    expect(sources.has("load_only")).toBe(true);
  });
});

