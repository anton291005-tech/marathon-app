import type { SessionType } from "./types";

const SESSION_TYPES: readonly SessionType[] = [
  "rest",
  "easy",
  "interval",
  "tempo",
  "long",
  "strength",
  "bike",
  "swim",
  "race",
];

const SESSION_TYPE_SET = new Set<string>(SESSION_TYPES as readonly string[]);

/**
 * Maps arbitrary plan/data strings to the canonical SessionType union.
 * Non-run types (bike, strength, swim) are kept as they are and never reinterpreted as a run.
 * Truly unknown values fall back to "easy" so training stays conservative.
 */
export function mapSessionType(input: string): SessionType {
  const key = input.trim().toLowerCase();
  if (SESSION_TYPE_SET.has(key)) {
    return key as SessionType;
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn("[mapSessionType] unknown session type, defaulting to easy:", input);
  }
  return "easy";
}
