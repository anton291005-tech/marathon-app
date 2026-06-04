/**
 * Interpretive layer: semantic uncertainty and AI reasoning mode.
 * Does not modify numeric scores — only meaning, UI, and copy.
 */

import type {
  AiReasoningMode,
  RecoveryConfidenceModel,
  RecoveryInsightDataMode,
  SemanticUncertaintyState,
} from "./recoveryTypes";

/** Uncertainty over latent R_t (rolling variance), not display score. */
export type LatentUncertaintyContext = {
  /** Sample variance of R_t over the rolling window (same units as R, 0–100 scale). */
  rVariance7d: number;
};

/** Maps quantitative confidence dimensions to discrete uncertainty for language/UI. */
export function deriveSemanticUncertaintyState(
  rc: RecoveryConfidenceModel,
  latent?: LatentUncertaintyContext | null,
): SemanticUncertaintyState {
  const blend = rc.dataCompleteness * 0.38 + rc.signalQuality * 0.32 + rc.physiologicalStability * 0.3;
  let state: SemanticUncertaintyState;
  if (blend >= 0.67 && rc.dataCompleteness >= 0.58 && rc.physiologicalStability >= 0.52) {
    state = "lowUncertainty";
  } else if (blend >= 0.4 && rc.dataCompleteness >= 0.28) {
    state = "mediumUncertainty";
  } else {
    state = "highUncertainty";
  }

  if (latent && Number.isFinite(latent.rVariance7d)) {
    const v = latent.rVariance7d;
    if (v > 185) return "highUncertainty";
    if (v > 95 && state === "lowUncertainty") return "mediumUncertainty";
    if (v > 95 && state === "mediumUncertainty") return "highUncertainty";
  }
  return state;
}

export function aiReasoningModeFromSemantic(state: SemanticUncertaintyState): AiReasoningMode {
  if (state === "lowUncertainty") return "deterministic";
  if (state === "mediumUncertainty") return "probabilistic";
  return "uncertain";
}

export function insightDataModeFromSemantic(state: SemanticUncertaintyState): RecoveryInsightDataMode {
  if (state === "lowUncertainty") return "full";
  if (state === "mediumUncertainty") return "partial";
  return "low";
}

export function certaintyLabelDe(state: SemanticUncertaintyState): string {
  if (state === "lowUncertainty") return "Sichere Einordnung";
  if (state === "mediumUncertainty") return "Teilsicher — vorsichtig lesen";
  return "Unsicher — nur Richtung, keine festen Aussagen";
}

export function semanticBadgeLabelDe(state: SemanticUncertaintyState): string {
  if (state === "lowUncertainty") return "Unsicherheit: niedrig";
  if (state === "mediumUncertainty") return "Unsicherheit: mittel";
  return "Unsicherheit: hoch";
}

/** Conservative rollup: one fragile day flags the week as at least that uncertain. */
export function rollupSemanticUncertaintyState(
  states: SemanticUncertaintyState[],
): SemanticUncertaintyState | null {
  if (states.length === 0) return null;
  if (states.some((s) => s === "highUncertainty")) return "highUncertainty";
  if (states.some((s) => s === "mediumUncertainty")) return "mediumUncertainty";
  return "lowUncertainty";
}

export function rollupAiReasoningMode(states: SemanticUncertaintyState[]): AiReasoningMode | null {
  const rolled = rollupSemanticUncertaintyState(states);
  return rolled ? aiReasoningModeFromSemantic(rolled) : null;
}
