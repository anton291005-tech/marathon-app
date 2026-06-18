export type TrainingPhase = "base" | "build" | "peak" | "taper";

export function trainingPhaseLabelDe(phase: TrainingPhase): string {
  if (phase === "base") return "Base";
  if (phase === "build") return "Build";
  if (phase === "peak") return "Peak";
  return "Taper";
}

export function trainingPhaseColor(phase: TrainingPhase): string {
  if (phase === "base") return "#10b981";
  if (phase === "build") return "#3b82f6";
  if (phase === "peak") return "#ef4444";
  return "#a855f7";
}

/**
 * Normalizes any phase string (including uppercase legacy / Claude-returned variants)
 * to the canonical lowercase TrainingPhase union.
 *
 * Mapping:
 *   BASE, base               → "base"
 *   BUILD, build, DEV, SPEC  → "build"  (DEV/SPEC are closest to build intensity)
 *   PEAK, peak               → "peak"
 *   TAPER, taper             → "taper"
 *   MINI, mini               → "base"   (pre-block, safest default)
 *   unknown / empty          → "base"   (safe fallback)
 */
export function normalizeTrainingPhase(raw: string | undefined | null): TrainingPhase {
  if (!raw) return "base";
  switch (raw.toUpperCase()) {
    case "BASE":
    case "MINI":
      return "base";
    case "BUILD":
    case "DEV":
    case "SPEC":
      return "build";
    case "PEAK":
      return "peak";
    case "TAPER":
      return "taper";
    default:
      // Already lowercase canonical — pass through if valid, else "base"
      if (raw === "base" || raw === "build" || raw === "peak" || raw === "taper") return raw;
      return "base";
  }
}

