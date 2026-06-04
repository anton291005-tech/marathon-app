export function getRecoveryInfluence(avgRecovery: number, avgConfidence: number): number {
  return avgRecovery * (0.3 + 0.7 * avgConfidence);
}

