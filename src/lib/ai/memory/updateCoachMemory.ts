import { getAppNowEpochMs } from "../../../core/time/timeSystem";
import { getCoachMemory, setCoachMemory, type CoachMemory } from "./coachMemory";

export type CoachMemoryEventType =
  | "rest_added"
  | "intensity_increased"
  | "swap"
  | "hard_workout"
  | "easy_workout";

export type CoachMemoryEvent = { type: CoachMemoryEventType };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function applyEvent(m: CoachMemory, event: CoachMemoryEvent): CoachMemory {
  const next: CoachMemory = { ...m };

  switch (event.type) {
    case "rest_added":
      next.restPreference = clamp(next.restPreference + 0.06, 0, 1);
      next.lastAdjustmentType = "decrease";
      break;
    case "hard_workout":
      next.fatigueBias = clamp(next.fatigueBias - 0.06, -1, 1);
      next.consecutiveHardDays = clamp(next.consecutiveHardDays + 1, 0, 365);
      break;
    case "easy_workout":
      next.fatigueBias = clamp(next.fatigueBias + 0.06, -1, 1);
      next.consecutiveHardDays = 0;
      break;
    case "swap":
      next.consecutiveHardDays = 0;
      break;
    case "intensity_increased":
      next.adaptationLevel = clamp(next.adaptationLevel + 0.04, 0, 1);
      next.lastAdjustmentType = "increase";
      break;
    default:
      break;
  }

  next.lastUpdated = getAppNowEpochMs();
  return next;
}

/** Side-effect only — never throws; safe to call after successful tool actions. */
export function updateCoachMemory(event: CoachMemoryEvent): void {
  try {
    const current = getCoachMemory();
    const merged = applyEvent(current, event);
    setCoachMemory(merged);
  } catch {
    // memory is best-effort — never block tools
  }
}

/**
 * Optional hook when a workout is logged with a 0–100 style load score.
 * Not wired automatically — call from logging flows when available.
 */
export function updateCoachMemoryFromLoadScore(loadScore: number | null | undefined): void {
  if (typeof loadScore !== "number" || !Number.isFinite(loadScore)) return;
  if (loadScore >= 70) {
    updateCoachMemory({ type: "hard_workout" });
  } else if (loadScore <= 35) {
    updateCoachMemory({ type: "easy_workout" });
  }
}
