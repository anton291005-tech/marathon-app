import type { Level3TrendAnalysis, RecoveryPoint, WorkoutTrendDatum } from "./types";

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mean(nums: number[]): number | null {
  const xs = nums.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function linearSlope(points: Array<{ x: number; y: number }>): number | null {
  // Simple least squares slope. Deterministic; ignores non-finite points.
  const ps = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (ps.length < 3) return null;
  const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const my = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  let num = 0;
  let den = 0;
  for (const p of ps) {
    const dx = p.x - mx;
    num += dx * (p.y - my);
    den += dx * dx;
  }
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  const s = num / den;
  return Number.isFinite(s) ? s : null;
}

function dayIndexFromYmd(ymd: string): number | null {
  // ymd is expected YYYY-MM-DD local key. Use Date parsing in UTC to get deterministic spacing.
  if (typeof ymd !== "string" || ymd.length < 10) return null;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round(t / 86400000);
}

function filterLastNDaysByDateKey<T extends { date: string }>(sortedAsc: T[], days: number): T[] {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return [];
  const lastDate = sortedAsc[sortedAsc.length - 1]?.date;
  const lastX = dayIndexFromYmd(lastDate);
  if (lastX == null) return [...sortedAsc];
  const minX = lastX - Math.max(0, days - 1);
  return sortedAsc.filter((p) => {
    const x = dayIndexFromYmd(p.date);
    return x != null && x >= minX && x <= lastX;
  });
}

function baselineAlignmentScore(args: {
  shortStrain: number;
  shortSlope: number;
  baselineStrain: number;
  baselineSlope: number;
}): number {
  // 0..1, deterministic agreement between short-term and baseline signals.
  const strainDir = (x: number) => (Math.abs(x - 1) <= 0.03 ? 0 : x > 1 ? 1 : -1);
  const slopeDir = (x: number) => (Math.abs(x) <= 0.08 ? 0 : x > 0 ? 1 : -1);
  const a = strainDir(args.shortStrain) === strainDir(args.baselineStrain) ? 1 : 0;
  const b = slopeDir(args.shortSlope) === slopeDir(args.baselineSlope) ? 1 : 0;
  return (a + b) / 2;
}

export function analyzeTrend(args: {
  history: WorkoutTrendDatum[];
  recovery: RecoveryPoint[] | null;
}): Level3TrendAnalysis | null {
  const hist = (args.history || []).filter((h) => typeof h?.load === "number" && Number.isFinite(h.load) && h.load > 0);
  if (hist.length < 4) {
    return { level: 3, trend: "insufficient_data", confidence: 0, strain: null, loadTrend: null, recoverySlope: null };
  }

  // Sort by date ascending to ensure stable windows (deterministic ordering).
  const sortedAll = [...hist].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Short-term window: last 14 days (existing behavior; upstream already provides 14d, but we enforce).
  const sorted = filterLastNDaysByDateKey(sortedAll, 14);
  const last = sorted.slice(-10);
  const last3 = sorted.slice(-3);
  const avg10 = mean(last.map((x) => x.load));
  const avg3 = mean(last3.map((x) => x.load));
  const loadTrend = avg10 && avg3 && avg10 > 0 ? avg3 / avg10 : null;

  const recovery = (args.recovery || []).filter((p) => typeof p?.score0_100 === "number" && Number.isFinite(p.score0_100));
  const recoverySortedAll = recovery.length ? [...recovery].sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  const recoveryShort = filterLastNDaysByDateKey(recoverySortedAll, 14);
  const recoveryRecent = recoveryShort.length ? recoveryShort.slice(-10) : [];
  const normalizedRecovery = (() => {
    const avg = mean(recoveryRecent.slice(-7).map((p) => p.score0_100));
    return avg == null ? null : clamp01(avg / 100);
  })();

  const slope = (() => {
    if (recoveryRecent.length < 4) return null;
    const points = recoveryRecent
      .map((p) => {
        const x = dayIndexFromYmd(p.date);
        return x == null ? null : { x, y: p.score0_100 };
      })
      .filter(Boolean) as Array<{ x: number; y: number }>;
    return linearSlope(points);
  })();

  if (loadTrend == null || normalizedRecovery == null || slope == null) {
    return { level: 3, trend: "insufficient_data", confidence: 0, strain: null, loadTrend, recoverySlope: slope };
  }

  const strain = loadTrend * (1 - normalizedRecovery);
  const recoveryDecreasing = slope < -0.25;
  const recoveryStable = Math.abs(slope) <= 0.18;
  const loadStable = Math.abs(loadTrend - 1) <= 0.12;
  const recoveryHigh = normalizedRecovery >= 0.7;
  const recoveryLow = normalizedRecovery <= 0.45;

  let trend: Level3TrendAnalysis["trend"] = "balanced";
  if (strain > 1.2 && recoveryDecreasing) trend = "overreaching";
  else if (strain < 0.8 && recoveryHigh) trend = "undertraining";
  else if (loadStable && recoveryStable) trend = "balanced";
  else if (strain > 1.05 && recoveryLow) trend = "risk";

  // Confidence: based on data coverage and signal magnitude (deterministic).
  const coverage = clamp01(Math.min(1, sorted.length / 10) * Math.min(1, recoveryRecent.length / 10));
  const signal = clamp01(Math.abs(strain - 1) / 0.6 + Math.abs(slope) / 2);
  let confidence = clamp01(0.2 + 0.55 * coverage + 0.25 * signal);

  // Optional baseline window (28 days) signal: may adjust confidence only, never classification.
  const baseline = (() => {
    const h28 = filterLastNDaysByDateKey(sortedAll, 28);
    const r28 = filterLastNDaysByDateKey(recoverySortedAll, 28);
    const h28last = h28.slice(-10);
    const h28last3 = h28.slice(-3);
    const bAvg10 = mean(h28last.map((x) => x.load));
    const bAvg3 = mean(h28last3.map((x) => x.load));
    const bLoadTrend = bAvg10 && bAvg3 && bAvg10 > 0 ? bAvg3 / bAvg10 : null;
    const r28recent = r28.length ? r28.slice(-10) : [];
    const bNormRec = (() => {
      const avg = mean(r28recent.slice(-7).map((p) => p.score0_100));
      return avg == null ? null : clamp01(avg / 100);
    })();
    const bSlope = (() => {
      if (r28recent.length < 4) return null;
      const points = r28recent
        .map((p) => {
          const x = dayIndexFromYmd(p.date);
          return x == null ? null : { x, y: p.score0_100 };
        })
        .filter(Boolean) as Array<{ x: number; y: number }>;
      return linearSlope(points);
    })();
    if (bLoadTrend == null || bNormRec == null || bSlope == null) return null;
    return { strain: bLoadTrend * (1 - bNormRec), slope: bSlope };
  })();

  if (baseline) {
    const align = baselineAlignmentScore({
      shortStrain: strain,
      shortSlope: slope,
      baselineStrain: baseline.strain,
      baselineSlope: baseline.slope,
    });
    confidence = clamp01(confidence * (0.9 + 0.1 * align));
  }

  return {
    level: 3,
    trend,
    confidence,
    strain,
    loadTrend,
    recoverySlope: slope,
  };
}

