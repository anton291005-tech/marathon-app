/**
 * Post-processing on merged daily rows: skin-temp deviation vs rolling median,
 * MAD-based down-weighting for HRV / RHR (values always retained).
 */

import type { PhysioSignalMeta, RecoveryDailyRow } from "./recoveryTypes";
import { mergePhysioMeta, mergeRecoverySignalMeta } from "./signalMetaUtils";

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(nums: number[], med: number): number {
  if (nums.length === 0) return 0;
  const devs = nums.map((x) => Math.abs(x - med));
  return median(devs) ?? 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Robust z from MAD; down-weight tails smoothly instead of deleting. */
function madDownweightMeta(val: number, med: number | null, m: number, reasonPrefix: string): PhysioSignalMeta {
  if (med === null || m < 1e-9) {
    return { confidenceWeight: 1, outlierFlag: false };
  }
  const denom = 1.4826 * m + 1e-9;
  const z = Math.abs(val - med) / denom;
  const w = clamp(1 - 0.24 * Math.max(0, z - 1.15), 0.22, 1);
  const outlier = z > 3.15;
  return {
    confidenceWeight: w,
    outlierFlag: outlier,
    reason: outlier ? `${reasonPrefix}_mad_tail` : undefined,
  };
}

function plausibilityMeta(
  val: number,
  inRange: boolean,
  reason: string,
  existing?: PhysioSignalMeta,
): PhysioSignalMeta {
  const base: PhysioSignalMeta = {
    confidenceWeight: inRange ? 1 : 0.35,
    outlierFlag: !inRange,
    reason: inRange ? undefined : reason,
  };
  return existing ? mergePhysioMeta(existing, base)! : base;
}

/**
 * Sort by date, compute wrist temp delta vs 28d trailing median of valid readings,
 * retain all HRV/RHR; attach MAD- and plausibility-based weights in signalMeta.
 */
export function finalizeRecoveryDailyRows(rows: RecoveryDailyRow[]): RecoveryDailyRow[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: RecoveryDailyRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row: RecoveryDailyRow = { ...sorted[i] };
    const past = sorted.slice(0, i);

    const temps = past
      .map((r) => r.wristTempReadingC)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const tempMed = median(temps.slice(-28));
    if (typeof row.wristTempReadingC === "number" && tempMed !== null) {
      row.wristTempDeltaC = Math.round((row.wristTempReadingC - tempMed) * 1000) / 1000;
    }

    const hrvPool = past
      .slice(-42)
      .map((r) => r.hrvMs)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const hMed = median(hrvPool);
    const hMad = mad(hrvPool, hMed ?? 0);

    const rhrPool = past
      .slice(-42)
      .map((r) => r.restingHr)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const rMed = median(rhrPool);
    const rMad = mad(rhrPool, rMed ?? 0);

    let signalMeta = row.signalMeta;

    if (typeof row.hrvMs === "number") {
      const inBand = row.hrvMs >= 5 && row.hrvMs <= 220;
      const plaus = plausibilityMeta(row.hrvMs, inBand, "hrv_plausible_range", signalMeta?.hrvMs);
      let nextHrvMeta = plaus;
      if (inBand && hMed !== null && hrvPool.length >= 5) {
        nextHrvMeta = mergePhysioMeta(nextHrvMeta, madDownweightMeta(row.hrvMs, hMed, hMad, "hrv"))!;
      }
      signalMeta = mergeRecoverySignalMeta(signalMeta, { hrvMs: nextHrvMeta });
    }

    if (typeof row.restingHr === "number") {
      const inBand = row.restingHr >= 38 && row.restingHr <= 120;
      const plaus = plausibilityMeta(row.restingHr, inBand, "rhr_plausible_range", signalMeta?.restingHr);
      let nextRhrMeta = plaus;
      if (inBand && rMed !== null && rhrPool.length >= 5) {
        nextRhrMeta = mergePhysioMeta(nextRhrMeta, madDownweightMeta(row.restingHr, rMed, rMad, "rhr"))!;
      }
      signalMeta = mergeRecoverySignalMeta(signalMeta, { restingHr: nextRhrMeta });
    }

    if (signalMeta && Object.keys(signalMeta).length > 0) {
      row.signalMeta = signalMeta;
    }

    out.push(row);
  }

  return out;
}
