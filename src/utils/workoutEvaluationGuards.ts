import { detectIntervalWorkout } from "../ai/analysis/intervalSegmentExtractor";

/**
 * True when session text / type indicates structured reps — full-session average pace must not
 * be used for intensity or “Plan vs Ist” pace verdicts.
 */
export function shouldUseIntervalScoring(workout: {
  sessionType?: string | null;
  sessionTitle?: string | null;
  planDescription?: string | null;
}): boolean {
  return detectIntervalWorkout(
    workout.sessionType ?? "",
    workout.sessionTitle ?? "",
    workout.planDescription ?? null,
  );
}
