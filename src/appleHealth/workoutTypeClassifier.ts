export type CanonicalWorkoutType = "run" | "bike" | "other";

/** Exact HealthKit / plugin labels we always treat as a run. */
const HK_RUN_LABELS = new Set(["running", "runningtreadmill", "run"]);

/**
 * Map HealthKit / bridge activity string → canonical type.
 * - Empty / missing → `other` (no silent default to run).
 * - Bike patterns checked before run patterns so strings like `crossCountrySkiing`
 *   are not misclassified via a `run` substring inside `country`.
 */
export function classifyWorkoutType(type: string): CanonicalWorkoutType {
  if (type == null || String(type).trim() === "") return "other";
  const raw = String(type).trim();
  const t = raw.toLowerCase();

  if (t.includes("cycl") || t.includes("bike") || t.includes("biking")) return "bike";

  if (HK_RUN_LABELS.has(t)) return "run";
  if (t.includes("running")) return "run";

  return "other";
}

/** true wenn wir den Typ aus HealthKit übernehmen (Lauf oder Rad). */
export function isSyncedCanonicalType(c: CanonicalWorkoutType): boolean {
  return c === "run" || c === "bike";
}
