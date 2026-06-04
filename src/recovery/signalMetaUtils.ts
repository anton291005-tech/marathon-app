/**
 * Per-signal confidence weights (no hard deletion of physiological samples).
 */

import type { PhysioSignalMeta, RecoverySignalMeta } from "./recoveryTypes";

export function mergePhysioMeta(a?: PhysioSignalMeta, b?: PhysioSignalMeta): PhysioSignalMeta | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    confidenceWeight: Math.min(
      clamp01(a.confidenceWeight),
      clamp01(b.confidenceWeight),
    ),
    outlierFlag: a.outlierFlag || b.outlierFlag,
    reason: [a.reason, b.reason].filter(Boolean).join("; ") || undefined,
  };
}

export function mergeRecoverySignalMeta(prev?: RecoverySignalMeta, next?: RecoverySignalMeta): RecoverySignalMeta | undefined {
  if (!prev) return next;
  if (!next) return prev;
  return {
    sleep: mergePhysioMeta(prev.sleep, next.sleep),
    hrvMs: mergePhysioMeta(prev.hrvMs, next.hrvMs),
    restingHr: mergePhysioMeta(prev.restingHr, next.restingHr),
  };
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Default weight when no meta attached (legacy rows). */
export function metaWeight(meta: PhysioSignalMeta | undefined): number {
  if (!meta) return 1;
  return clamp01(meta.confidenceWeight);
}
