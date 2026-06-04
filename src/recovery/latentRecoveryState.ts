/**
 * Latent physiological recovery R_t ∈ [0,100] — Kalman-light / Bayesian-style update.
 * Observations are noisy; score/confidence are projections of R, not the model itself.
 */

export type RecoveryBaselineVector = {
  sleep: number;
  hrv: number;
  rhr: number;
  /** Median respiration (brpm) for normalize(); null falls back to population-ish center */
  respirationMedian: number | null;
};

export type RecoveryObservationVector = {
  sleep: number;
  hrv: number;
  rhr: number;
  /** Raw daily training load (km-weighted), same units as trainingDailyLoad */
  trainingLoad: number;
  respiration: number;
};

export type LatentGainMeta = {
  /** Mirrors RecoveryConfidenceModel.overallConfidence — trust in observations */
  baseConfidence: number;
  physiologicalStability: number;
};

export type LatentRecoveryState = {
  R: number;
  meta: LatentGainMeta;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeVariance(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  if (m === null) return 0;
  return mean(vals.map((x) => (x - m) ** 2)) ?? 0;
}

/** Standard logistic on deviation (hours); centered so Δ=0 → 0.5 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Spec: nonlinear training stress — not a linear load effect.
 */
export function nonlinearStressCurve(load: number): number {
  const sigmoidPart = 1 / (1 + Math.exp(-0.4 * (load - 12)));
  const superlinearTail = Math.pow(Math.max(load - 15, 0), 1.7);
  return sigmoidPart + 0.15 * superlinearTail;
}

/**
 * Couples training stress to latent fatigue: low R_t amplifies stress impact, high R_t dampens it.
 * Used as: stress(load) × contextFactor(R_prev).
 */
export function trainingContextFactorFromR(R: number): number {
  return clamp(0.55 + ((100 - R) / 100) * 0.9, 0.45, 1.45);
}

/** Map respiration (brpm) to [0,1] relative to personal median */
export function normalizeRespiration(respiration: number, baselineMed: number | null): number {
  if (!Number.isFinite(respiration)) return 0.5;
  if (baselineMed !== null && baselineMed > 0) {
    const dev = Math.abs(respiration - baselineMed) / baselineMed;
    return clamp(1 - dev * 2.2, 0, 1);
  }
  return clamp(1 - Math.abs(respiration - 15) / 12, 0, 1);
}

/**
 * Map weighted raw sum to [0,100] proxy comparable to R_t.
 * Component scales follow the spec; this calibration keeps updates stable vs K.
 */
function proxyRawToLatent100(raw: number): number {
  return clamp(50 + 28 * Math.tanh(raw), 0, 100);
}

/**
 * Observation proxy — noisy estimate of recovery level before latent fusion.
 */
export function computeObservedRecoveryProxy(
  obs: RecoveryObservationVector,
  baseline: RecoveryBaselineVector,
  sleepQualityWeight: number,
  /** R_{t-1} before this observation update — modulates training stress magnitude */
  latentRPrev: number,
): number {
  const sleepSignal = sigmoid(obs.sleep - baseline.sleep) * sleepQualityWeight;

  const hrvSignal =
    baseline.hrv > 0 && Number.isFinite(obs.hrv) ? (obs.hrv - baseline.hrv) / baseline.hrv : 0;

  const rhrSignal = Number.isFinite(obs.rhr) ? -(obs.rhr - baseline.rhr) : 0;

  const trainingStress =
    nonlinearStressCurve(obs.trainingLoad) * trainingContextFactorFromR(latentRPrev);

  const respirationSignal = normalizeRespiration(obs.respiration, baseline.respirationMedian);

  const raw =
    sleepSignal * 0.4 +
    hrvSignal * 0.25 +
    rhrSignal * 0.15 +
    respirationSignal * 0.1 +
    -trainingStress * 0.16;

  return proxyRawToLatent100(raw);
}

export function computeGain(meta: LatentGainMeta): number {
  return clamp(meta.baseConfidence * meta.physiologicalStability, 0.05, 0.7);
}

export function deriveScore(R: number): number {
  return Math.round(R);
}

/**
 * Spec: confidence from variance of R (last window). Extended with completeness + observation noise.
 */
export function computeConfidenceFromRVariance(rValues: number[]): number {
  const variance = computeVariance(rValues);
  return clamp(1 - variance * 0.02, 0.3, 1.0);
}

export function computeObservationNoiseLevel(signalQuality: number, dataCompleteness: number): number {
  const gap = 1 - clamp(signalQuality, 0, 1) * 0.65 - clamp(dataCompleteness, 0, 1) * 0.35;
  return clamp(gap, 0, 1);
}

export function blendLatentConfidence(
  varianceConfidence: number,
  dataCompleteness: number,
  signalQuality: number,
  observationNoise: number,
): number {
  const noiseTerm = clamp(1 - observationNoise * 0.4, 0.35, 1);
  return clamp(
    varianceConfidence * 0.48 +
      dataCompleteness * 0.18 +
      signalQuality * 0.17 +
      noiseTerm * 0.17,
    0.3,
    1.0,
  );
}

/**
 * K uses prevState.meta (yesterday). After the update, state.meta should be set to this day's
 * trust (baseConfidence × physiologicalStability) so the next day uses the right Kalman gain.
 */
export function updateRecoveryState(
  prevState: LatentRecoveryState,
  observations: RecoveryObservationVector,
  baseline: RecoveryBaselineVector,
  sleepQualityWeight: number,
  metaForNextStep: LatentGainMeta,
): LatentRecoveryState {
  const proxy = computeObservedRecoveryProxy(observations, baseline, sleepQualityWeight, prevState.R);
  const K = computeGain(prevState.meta);
  const newR = prevState.R + K * (proxy - prevState.R);
  return {
    R: clamp(newR, 0, 100),
    meta: metaForNextStep,
  };
}

export const INITIAL_LATENT_META: LatentGainMeta = {
  baseConfidence: 0.52,
  physiologicalStability: 0.52,
};

export function defaultInitialLatentState(): LatentRecoveryState {
  return { R: 50, meta: { ...INITIAL_LATENT_META } };
}
