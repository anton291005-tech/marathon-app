export function isRunWorkout(workout: unknown): workout is { type: "run" } {
  return !!workout && typeof workout === "object" && (workout as any).type === "run";
}

