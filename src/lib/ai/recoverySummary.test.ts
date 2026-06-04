import type { DailyRecoveryComputed } from "../../recovery/recoveryTypes";
import { buildRecoverySummaryFromSeries } from "./recoverySummary";

function day(args: Partial<DailyRecoveryComputed> & { date: string; score: number; pointConfidence: number; source: "physio" | "load_only" }): DailyRecoveryComputed {
  // Minimal shape required by summary
  return {
    date: args.date,
    latentR: args.score,
    rawScore: args.score,
    score: args.score,
    smoothedLatentR: args.score,
    pointConfidence: args.pointConfidence,
    source: args.source,
    sub: { trainingLoad: 80 },
    coverage: 1,
    scoreConfidence: "full",
    recoveryConfidence: { dataCompleteness: 1, signalQuality: 1, physiologicalStability: 1, overallConfidence: 1 },
    insightDataMode: "full",
    semanticUncertaintyState: "lowUncertainty",
    aiReasoningMode: "deterministic",
  };
}

describe("buildRecoverySummaryFromSeries", () => {
  it("physio dominates mixed dataset (load_only must not override measured points)", () => {
    const series: DailyRecoveryComputed[] = [
      day({ date: "2026-04-01", score: 80, pointConfidence: 0.9, source: "physio" }),
      day({ date: "2026-04-02", score: 78, pointConfidence: 0.9, source: "physio" }),
      day({ date: "2026-04-03", score: 20, pointConfidence: 0.4, source: "load_only" }),
      day({ date: "2026-04-04", score: 15, pointConfidence: 0.4, source: "load_only" }),
    ];
    const s = buildRecoverySummaryFromSeries(series);
    // AvgRecovery should stay near the physio values, not be dragged down by load-only.
    expect(s.avgRecovery).toBeGreaterThanOrEqual(70);
    expect(s.dominantSource).toBe("physio");
    expect(s.influenceWeight).toBeGreaterThan(0);
  });

  it("same recovery, different confidence => different influenceWeight (continuous, never zero)", () => {
    const hi: DailyRecoveryComputed[] = [
      day({ date: "2026-04-01", score: 60, pointConfidence: 1.0, source: "physio" }),
      day({ date: "2026-04-02", score: 60, pointConfidence: 1.0, source: "physio" }),
    ];
    const lo: DailyRecoveryComputed[] = [
      day({ date: "2026-04-01", score: 60, pointConfidence: 0.3, source: "load_only" }),
      day({ date: "2026-04-02", score: 60, pointConfidence: 0.3, source: "load_only" }),
    ];
    const a = buildRecoverySummaryFromSeries(hi);
    const b = buildRecoverySummaryFromSeries(lo);
    expect(a.avgConfidence).toBeGreaterThan(b.avgConfidence);
    expect(a.influenceWeight).toBeGreaterThan(b.influenceWeight);
    expect(b.influenceWeight).toBeGreaterThan(0);
    expect(b.influenceWeight).toBeGreaterThanOrEqual(0.3);
  });
});

