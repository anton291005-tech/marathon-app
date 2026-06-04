/**
 * Canonical training recovery label — derived only from RecoveryDomainState.
 */
import type { RecoveryDomainState } from "./recoveryDomainState";

/** Exposes `trainingRecoveryLabel` from the domain snapshot for callers that need the string. */
export function trainingRecoveryLabelFromDomain(domain: RecoveryDomainState): string {
  return domain.trainingRecoveryLabel;
}
