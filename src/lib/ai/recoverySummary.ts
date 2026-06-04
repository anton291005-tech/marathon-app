import type { RecoveryDomainState } from "../../recovery/recoveryDomainState";
import type { DailyRecoveryComputed, DailyRecoverySource } from "../../recovery/recoveryTypes";
import { getRecoveryInfluence } from "../../recovery/getRecoveryInfluence";

export type RecoverySummary = {
  avgRecovery: number;
  avgConfidence: number;
  /** Continuous 0.3..1.0 weight derived from confidence (never 0). */
  influenceWeight: number;
  dominantSource: DailyRecoverySource;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function weightRecoveryPoint(point: { recoveryScore: number; pointConfidence: number }): number {
  return point.recoveryScore * point.pointConfidence;
}

function confidenceWeightedAverage(points: Array<{ recoveryScore: number; pointConfidence: number }>): number | null {
  const denom = points.reduce((a, p) => a + (Number.isFinite(p.pointConfidence) ? Math.max(0, p.pointConfidence) : 0), 0);
  if (denom <= 1e-9) return null;
  const num = points.reduce(
    (a, p) =>
      a +
      (Number.isFinite(p.recoveryScore) && Number.isFinite(p.pointConfidence)
        ? weightRecoveryPoint({ recoveryScore: p.recoveryScore, pointConfidence: Math.max(0, p.pointConfidence) })
        : 0),
    0,
  );
  return num / denom;
}

function meanConfidence(points: Array<{ pointConfidence: number }>): number | null {
  const vals = points.map((p) => p.pointConfidence).filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function dominantSourceByTotalConfidence(points: Array<{ source: DailyRecoverySource; pointConfidence: number }>): DailyRecoverySource {
  let phys = 0;
  let load = 0;
  for (const p of points) {
    const w = Number.isFinite(p.pointConfidence) ? Math.max(0, p.pointConfidence) : 0;
    if (p.source === "physio") phys += w;
    else load += w;
  }
  return phys >= load ? "physio" : "load_only";
}

/**
 * Summary for AI decision-making.
 *
 * Safety rules:
 * - If physio points exist, they dominate the score computation (do not let load_only override measured signals).
 * - Always compute confidence-weighted averages (never naive means).
 */
export function buildRecoverySummaryFromSeries(series: DailyRecoveryComputed[]): RecoverySummary {
  const sorted = [...(series || [])].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const physio = last7.filter((p) => p.source === "physio");
  const pointsForScore = physio.length ? physio : last7;

  const avgRecoveryRaw = confidenceWeightedAverage(
    pointsForScore.map((p) => ({ recoveryScore: p.score, pointConfidence: p.pointConfidence })),
  );
  const avgConfidenceRaw = meanConfidence(pointsForScore.map((p) => ({ pointConfidence: p.pointConfidence })));

  const dominantSource = dominantSourceByTotalConfidence(last7.map((p) => ({ source: p.source, pointConfidence: p.pointConfidence })));
  const avgRecovery = Math.round(clamp(avgRecoveryRaw ?? 50, 0, 100));
  const avgConfidence = clamp(avgConfidenceRaw ?? 0.3, 0, 1);
  const influenceWeight = getRecoveryInfluence(1, avgConfidence); // 1*(0.3+0.7*conf) => [0.3..1.0]
  return {
    avgRecovery,
    avgConfidence,
    influenceWeight,
    dominantSource,
  };
}

/**
 * Domain-level summary for contexts that may not have a populated series.
 * Uses last-7 series when present; otherwise falls back to the home KPI source.
 */
export function buildRecoverySummaryFromDomain(domain: RecoveryDomainState): RecoverySummary {
  if (domain.series && domain.series.length) return buildRecoverySummaryFromSeries(domain.series);

  const score = typeof domain.homeRecoveryScore0_100 === "number" && Number.isFinite(domain.homeRecoveryScore0_100) ? domain.homeRecoveryScore0_100 : 50;
  const src = domain.homeRecoveryScoreSource === "loadOnly" ? ("load_only" as const) : ("physio" as const);
  const conf =
    domain.homeRecoveryScoreSource === "loadOnly"
      ? 0.45
      : domain.homeRecoveryScoreSource === "fallback7d"
        ? 0.8
        : 0.9;
  const avgRecovery = Math.round(clamp(score, 0, 100));
  const avgConfidence = conf;
  const influenceWeight = getRecoveryInfluence(1, avgConfidence);
  return { avgRecovery, avgConfidence, influenceWeight, dominantSource: src };
}

