import { buildPlanWeekToDateMap, computeDailyRecoverySeries } from "./recoveryScoringEngine";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";

function variance(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mu = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((a, b) => a + (b - mu) ** 2, 0) / nums.length;
}

describe("Recovery trend continuity (no flatline)", () => {
  it("produces a continuous daily series even without Apple Health rows (load-only path)", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        label: "W1",
        dates: "—",
        s: [
          { id: "d1", day: "Mo", date: "01. Apr", type: "easy", title: "E", km: 6 },
          { id: "d2", day: "Di", date: "02. Apr", type: "long", title: "L", km: 20 },
          { id: "d3", day: "Mi", date: "03. Apr", type: "easy", title: "E", km: 8 },
          { id: "d4", day: "Do", date: "04. Apr", type: "rest", title: "R", km: 0 },
          { id: "d5", day: "Fr", date: "05. Apr", type: "tempo", title: "T", km: 10 },
        ],
      } as PlanWeek,
    ];

    const logs: Record<string, SessionLog> = {
      d1: { done: true },
      d2: { done: true },
      d3: { done: true },
      d5: { done: true },
    };
    const recoveryDailyRows: RecoveryDailyRow[] = [];

    const now = new Date("2026-04-05T12:00:00");
    const planMap = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries(recoveryDailyRows, planMap, plan, logs, now);

    expect(series.length).toBeGreaterThanOrEqual(1);
    // Every day must have a numeric score in [0,100]
    for (const d of series) {
      expect(typeof d.latentR).toBe("number");
      expect(Number.isFinite(d.latentR)).toBe(true);
      expect(d.latentR).toBeGreaterThanOrEqual(0);
      expect(d.latentR).toBeLessThanOrEqual(100);
    }
  });

  it("load spike causes a recovery drop (no physio inputs)", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        label: "W1",
        dates: "—",
        s: [
          // Establish a steady baseline first (avoid cold-start ramp dominating the comparison)
          { id: "a1", day: "Mo", date: "01. Apr", type: "easy", title: "E", km: 6 },
          { id: "a2", day: "Di", date: "02. Apr", type: "easy", title: "E", km: 6 },
          { id: "a3", day: "Mi", date: "03. Apr", type: "easy", title: "E", km: 6 },
          { id: "a4", day: "Do", date: "04. Apr", type: "easy", title: "E", km: 6 },
          { id: "a5", day: "Fr", date: "05. Apr", type: "easy", title: "E", km: 6 },
          { id: "a6", day: "Sa", date: "06. Apr", type: "easy", title: "E", km: 6 },
          { id: "a7", day: "So", date: "07. Apr", type: "easy", title: "E", km: 6 },
          // Spike
          { id: "a8", day: "Mo", date: "08. Apr", type: "long", title: "L", km: 32 },
          { id: "a9", day: "Di", date: "09. Apr", type: "rest", title: "R", km: 0 },
        ],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = {
      a1: { done: true },
      a2: { done: true },
      a3: { done: true },
      a4: { done: true },
      a5: { done: true },
      a6: { done: true },
      a7: { done: true },
      // Force a clear spike even under distance sanitization.
      a8: { done: true, actualKm: "60" },
    };
    const now = new Date("2026-04-09T12:00:00");
    const planMap = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries([], planMap, plan, logs, now);

    const byDate = new Map(series.map((s) => [s.date, s]));
    const pre = byDate.get("2026-04-07")!;
    const spike = byDate.get("2026-04-08")!;
    const after = byDate.get("2026-04-09")!;

    // Sanity: the spike day must have meaningfully higher load (lower load subscore).
    expect(spike.sub.trainingLoad).toBeLessThan(pre.sub.trainingLoad);

    const preTarget = pre.observedRecoveryProxy!;
    const spikeTarget = spike.observedRecoveryProxy!;
    const afterTarget = after.observedRecoveryProxy!;
    expect(typeof preTarget).toBe("number");
    expect(typeof spikeTarget).toBe("number");
    expect(typeof afterTarget).toBe("number");

    // The model's per-day target must drop on a spike day (even if latent R has inertia).
    expect(Math.min(spikeTarget, afterTarget)).toBeLessThan(preTarget);
  });

  it("rest week tends to raise recovery after a loaded block (no physio inputs)", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        label: "W1",
        dates: "—",
        s: [
          { id: "b1", day: "Mo", date: "01. Apr", type: "tempo", title: "T", km: 12 },
          { id: "b2", day: "Di", date: "02. Apr", type: "tempo", title: "T", km: 12 },
          { id: "b3", day: "Mi", date: "03. Apr", type: "long", title: "L", km: 26 },
          { id: "b4", day: "Do", date: "04. Apr", type: "easy", title: "E", km: 10 },
          { id: "b5", day: "Fr", date: "05. Apr", type: "easy", title: "E", km: 10 },
          { id: "b6", day: "Sa", date: "06. Apr", type: "rest", title: "R", km: 0 },
          { id: "b7", day: "So", date: "07. Apr", type: "rest", title: "R", km: 0 },
          { id: "b8", day: "Mo", date: "08. Apr", type: "rest", title: "R", km: 0 },
        ],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = {
      b1: { done: true },
      b2: { done: true },
      b3: { done: true },
      b4: { done: true },
      b5: { done: true },
    };
    const now = new Date("2026-04-08T12:00:00");
    const planMap = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries([], planMap, plan, logs, now);

    const byDate = new Map(series.map((s) => [s.date, s.smoothedLatentR]));
    const endLoadBlock = byDate.get("2026-04-05")!;
    const endRest = byDate.get("2026-04-08")!;
    expect(endRest).toBeGreaterThan(endLoadBlock);
  });

  it("does not regress to a flat line when load varies (variance > 0)", () => {
    const plan: PlanWeek[] = [
      {
        wn: 1,
        phase: "TEST",
        km: 0,
        label: "W1",
        dates: "—",
        s: [
          { id: "c1", day: "Mo", date: "01. Apr", type: "easy", title: "E", km: 6 },
          { id: "c2", day: "Di", date: "02. Apr", type: "tempo", title: "T", km: 12 },
          { id: "c3", day: "Mi", date: "03. Apr", type: "rest", title: "R", km: 0 },
          { id: "c4", day: "Do", date: "04. Apr", type: "long", title: "L", km: 28 },
          { id: "c5", day: "Fr", date: "05. Apr", type: "easy", title: "E", km: 8 },
        ],
      } as PlanWeek,
    ];
    const logs: Record<string, SessionLog> = {
      c1: { done: true },
      c2: { done: true },
      c4: { done: true },
      c5: { done: true },
    };
    const now = new Date("2026-04-05T12:00:00");
    const planMap = buildPlanWeekToDateMap(plan);
    const { series } = computeDailyRecoverySeries([], planMap, plan, logs, now);
    const vals = series.map((s) => s.smoothedLatentR);
    expect(variance(vals)).toBeGreaterThan(0);
  });
});

