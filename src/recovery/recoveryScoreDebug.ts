/**
 * Recovery model guards + small delta-hints (optional).
 *
 * Production cleanup rule:
 * - No console logging in the recovery system (including here).
 * - Any debugging must be explicit and UI-driven behind REACT_APP_RECOVERY_DEBUG=1.
 */

export function isRecoveryGuardEnabled(): boolean {
  return typeof process !== "undefined" && process.env.REACT_APP_RECOVERY_GUARD === "1";
}

export type RecoveryScoreContributingFactorsLog = {
  base: number;
  sleep: number | null;
  hrv: number | null;
  restingHR: number | null;
  trainingPenalty: number;
  todayTrainingPenalty: number;
  executionNudge: number;
  smoothing: number;
  scoreAfterModelGuards?: number;
  finalScore: number;
  todayLoadUnits: number;
  weightedLatentR: number;
  flatMeanLatentR: number;
  executionRatio: number;
  confidenceWeight: number;
  /** @deprecated Alias for trainingPenalty */
  loadNudge: number;
  /** @deprecated Alias for base */
  smoothedLatentR: number;
  /** @deprecated Alias for smoothing */
  weeklyBlendEffect: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export type TrainingConsistencyGuardResult = {
  score: number;
  didClamp: boolean;
};

/**
 * Prevent implausible upward jumps on days with meaningful training load.
 * This never increases the score.
 */
export function applyTrainingConsistencyGuard(args: {
  previousScore: number | null;
  nextScore: number;
  todayTrainingPenalty: number;
}): TrainingConsistencyGuardResult {
  if (!isRecoveryGuardEnabled()) return { score: args.nextScore, didClamp: false };
  if (args.previousScore == null) return { score: args.nextScore, didClamp: false };
  if (args.nextScore <= args.previousScore) return { score: args.nextScore, didClamp: false };

  // Only clamp when there was meaningful training today (penalty negative).
  if (!(Number.isFinite(args.todayTrainingPenalty) && args.todayTrainingPenalty < -3.5)) {
    return { score: args.nextScore, didClamp: false };
  }

  const maxUp = 2;
  const clamped = clamp(args.nextScore, args.previousScore, args.previousScore + maxUp);
  return { score: clamped, didClamp: clamped !== args.nextScore };
}

export type RecoveryDeltaHintContext = {
  todayDistanceKm?: number | null;
  trainingTypeLabel?: string | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Minimal user-facing hints for score changes.
 * (No technical wording; no internal factor names.)
 */
export function inferRecoveryScoreDeltaHints(
  prev: RecoveryScoreContributingFactorsLog | null,
  next: RecoveryScoreContributingFactorsLog,
  scoreDelta?: { from: number; to: number },
  context?: RecoveryDeltaHintContext,
): string[] {
  if (!prev) return [];
  const hints: string[] = [];

  if (scoreDelta) {
    const d = scoreDelta.to - scoreDelta.from;
    if (Math.abs(d) >= 1) hints.push(`Gesamt ${d >= 0 ? "+" : ""}${Math.round(d)} Punkte`);
  }

  const td = (next.todayTrainingPenalty ?? 0) - (prev.todayTrainingPenalty ?? 0);
  if (Math.abs(td) >= 0.35) {
    const km = context?.todayDistanceKm;
    if (km != null && Number.isFinite(km) && km > 0) {
      const typ = context?.trainingTypeLabel ? ` (${context.trainingTypeLabel})` : "";
      hints.push(`Training heute: ${round1(km)} km${typ}`);
    } else {
      hints.push("Training heute beeinflusst die Recovery");
    }
  }

  return hints;
}
