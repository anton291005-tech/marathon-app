import { buildPlanWeekToDateMap, buildRecoveryWeekRollups, computeDailyRecoverySeries } from "./computeRecoveryScores";
import { finalizeRecoveryDailyRows } from "./finalizeRecoveryDailyRows";
import { ymd } from "./recoveryCalendarUtils";
import type { PlanWeek } from "../marathonPrediction";
import type { RecoveryDailyRow } from "./recoveryTypes";

const stubWeek: PlanWeek = {
  wn: 1,
  phase: "MINI",
  km: 40,
  s: [
    { id: "a", day: "Mo", date: "6. Apr", type: "easy", title: "E", km: 8, desc: "", pace: "" },
    { id: "b", day: "Di", date: "7. Apr", type: "rest", title: "R", km: 0, desc: "", pace: "" },
  ],
};

describe("computeDailyRecoverySeries", () => {
  it("produces bounded scores with physiological data", () => {
    const rows: RecoveryDailyRow[] = [
      { date: "2026-04-10", sleepHours: 7.2, hrvMs: 48, restingHr: 52, respiratoryBrpm: 15 },
      { date: "2026-04-11", sleepHours: 7.0, hrvMs: 46, restingHr: 53, respiratoryBrpm: 15.2 },
    ];
    const map = buildPlanWeekToDateMap([stubWeek]);
    const { series } = computeDailyRecoverySeries(rows, map, [stubWeek], {}, new Date("2026-04-20"));
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      expect(s.latentR).toBeGreaterThanOrEqual(0);
      expect(s.latentR).toBeLessThanOrEqual(100);
      expect(s.rawScore).toBe(Math.round(s.latentR));
      expect(s.rawScore).toBeGreaterThanOrEqual(0);
      expect(s.rawScore).toBeLessThanOrEqual(100);
      expect(s.score).toBe(s.rawScore);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.smoothedLatentR).toBeGreaterThanOrEqual(0);
      expect(s.smoothedLatentR).toBeLessThanOrEqual(100);
      expect(s.recoveryConfidence.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(s.recoveryConfidence.overallConfidence).toBeLessThanOrEqual(1);
      expect(["lowUncertainty", "mediumUncertainty", "highUncertainty"]).toContain(s.semanticUncertaintyState);
      expect(["deterministic", "probabilistic", "uncertain"]).toContain(s.aiReasoningMode);
    }
  });

  it("still estimates latent R on the calendar when only secondary vitals exist (dense series)", () => {
    const rows: RecoveryDailyRow[] = [{ date: "2026-04-10", respiratoryBrpm: 15 }];
    const map = buildPlanWeekToDateMap([stubWeek]);
    const { series } = computeDailyRecoverySeries(rows, map, [stubWeek], {}, new Date("2026-04-20"));
    expect(series.length).toBeGreaterThan(3);
    const apr10 = series.find((s) => s.date === "2026-04-10");
    expect(apr10).toBeDefined();
    expect(apr10!.latentR).toBeGreaterThanOrEqual(0);
    expect(apr10!.latentR).toBeLessThanOrEqual(100);
  });
});

describe("finalizeRecoveryDailyRows", () => {
  it("retains HRV spikes but down-weights vs robust baseline when history exists", () => {
    const base: RecoveryDailyRow[] = [];
    const t0 = new Date(2026, 0, 1);
    for (let i = 0; i < 10; i++) {
      const d = new Date(t0);
      d.setDate(t0.getDate() + i);
      base.push({ date: ymd(d), hrvMs: 52, restingHr: 55 });
    }
    const spike = new Date(t0);
    spike.setDate(t0.getDate() + 10);
    base.push({ date: ymd(spike), hrvMs: 400, restingHr: 55 });
    const rows = finalizeRecoveryDailyRows(base);
    const last = rows[rows.length - 1];
    expect(last.hrvMs).toBe(400);
    expect(last.signalMeta?.hrvMs?.outlierFlag).toBe(true);
    expect(last.signalMeta?.hrvMs?.confidenceWeight ?? 1).toBeLessThan(0.85);
  });
});

describe("training stress amplifier", () => {
  it("only pulls recovery down vs a light day — never boosts above pure physiology", () => {
    const rows: RecoveryDailyRow[] = [{ date: "2026-04-10", sleepHours: 7.2, hrvMs: 48, restingHr: 52, respiratoryBrpm: 15 }];
    const weekHighLoad: PlanWeek = {
      wn: 1,
      phase: "MINI",
      km: 120,
      s: [
        { id: "x1", day: "Do", date: "10. Apr", type: "interval", title: "I", km: 18, desc: "", pace: "" },
        { id: "x2", day: "Fr", date: "11. Apr", type: "rest", title: "R", km: 0, desc: "", pace: "" },
      ],
    };
    const weekLight: PlanWeek = {
      wn: 1,
      phase: "MINI",
      km: 0,
      s: [{ id: "y1", day: "Do", date: "10. Apr", type: "rest", title: "R", km: 0, desc: "", pace: "" }],
    };
    const mapH = buildPlanWeekToDateMap([weekHighLoad]);
    const mapL = buildPlanWeekToDateMap([weekLight]);
    const hiTrain = computeDailyRecoverySeries(rows, mapH, [weekHighLoad], { x1: { done: true } }, new Date("2026-04-20"));
    const loTrain = computeDailyRecoverySeries(rows, mapL, [weekLight], {}, new Date("2026-04-20"));
    const hiApr10 = hiTrain.series.find((s) => s.date === "2026-04-10");
    const loApr10 = loTrain.series.find((s) => s.date === "2026-04-10");
    expect(hiApr10).toBeDefined();
    expect(loApr10).toBeDefined();
    expect(hiApr10!.rawScore).toBeLessThanOrEqual(loApr10!.rawScore);
  });
});

describe("buildRecoveryWeekRollups", () => {
  it("surfaces a latent R̂ rollup from the model", () => {
    const rollups = buildRecoveryWeekRollups({
      plan: [stubWeek],
      logs: {},
      dailyRows: [],
      now: new Date("2026-04-20"),
    });
    expect(rollups[0].hasHealthData).toBe(false);
    expect(rollups[0].recoveryScore).not.toBeNull();
    expect(rollups[0].recoveryScore).toBeGreaterThanOrEqual(0);
    expect(rollups[0].recoveryScore).toBeLessThanOrEqual(100);
    expect(rollups[0].trend7.length).toBeGreaterThanOrEqual(2);
    expect(rollups[0].latentTrendBandHalfWidth).toBeGreaterThan(0);
  });
});
