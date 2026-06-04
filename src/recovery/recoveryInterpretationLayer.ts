/**
 * Single interpretation surface for AI and remote coach: RecoveryDomainState → coach-facing facts.
 * Does not read plan, logs, Apple Health rows, or settings — only the domain snapshot.
 */

import { recoveryScoreBandOrdinal } from "./recoveryLegacySignals";
import type { RecoveryDomainKind, RecoveryDomainState } from "./recoveryDomainState";

export type RecoveryCoachInterpretation = {
  domainKind: RecoveryDomainKind;
  trainingRecoveryLabel: string;
  homeRecoveryScore0_100: number | null;
  isInsufficient: boolean;
  /** 0 = niedrig … 3 = frisch — aligned mit Score; `null` wenn `isInsufficient`. */
  recoveryBandOrdinal: 0 | 1 | 2 | 3 | null;
  insightText: string;
  insightWarning: boolean;
  latentRt: number | null;
  latentTrend7d: string;
  uncertaintyTier: string;
};

export function buildRecoveryCoachInterpretation(domain: RecoveryDomainState): RecoveryCoachInterpretation {
  const latent = domain.latent;
  const score = domain.homeRecoveryScore0_100;
  return {
    domainKind: domain.domainKind,
    trainingRecoveryLabel: domain.trainingRecoveryLabel,
    homeRecoveryScore0_100: score,
    isInsufficient: domain.isInsufficient,
    recoveryBandOrdinal:
      domain.domainKind === "initial" || score == null ? null : recoveryScoreBandOrdinal(score),
    insightText: domain.insight.text || "",
    insightWarning: domain.insight.showWarning,
    latentRt: latent.R_t,
    latentTrend7d: latent.trend7d,
    uncertaintyTier: latent.uncertaintyTier,
  };
}

/** Short hint for copy when a “next session” placeholder is needed — domain insight only. */
export function nextSchedulingHintFromDomain(domain: RecoveryDomainState): string {
  const t = domain.insight.text?.trim();
  if (t) {
    if (t.length <= 160) return t;
    const max = 160;
    const clipped = t.slice(0, max).trim();
    const lastPunct = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("!"), clipped.lastIndexOf("?"));
    if (lastPunct >= 40) return clipped.slice(0, lastPunct + 1).trim();
    const lastSpace = clipped.lastIndexOf(" ");
    if (lastSpace >= 40) return `${clipped.slice(0, lastSpace).trim()}.`;
    return "deine nächste wichtige Einheit";
  }
  return "deine nächste wichtige Einheit";
}
