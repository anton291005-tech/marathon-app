/**
 * Reine Hilfsfunktion für Tests und UI (kein HealthKit-Call).
 */
export function appleHealthMissingCyclingDistance(readAuthorized: string[] | undefined | null): boolean {
  if (!readAuthorized || readAuthorized.length === 0) return false;
  return readAuthorized.includes("workouts") && !readAuthorized.includes("distanceCycling");
}
