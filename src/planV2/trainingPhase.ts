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

