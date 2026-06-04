import type { CoachIntent } from "./types";

/**
 * Routes user text to coarse intents before the LLM. Swap uses word-boundary patterns only—no substring
 * "taus" matching—to avoid accidental activation; extension point for injury/fatigue/race-week later.
 */
export function detectCoachIntent(input: string): CoachIntent {
  if (!input || typeof input !== "string") return "general";

  const s = input.toLowerCase();

  // SWAP INTENT (word-boundary safe; consolidated from former swap prefilter)
  const swapKeywords = [
    /\bswap\b/i,
    /\btausch\b/i,
    /\btausche\b/i,
    /\bswitch\b/i,
    /\bvertausch(?:en)?\b/i,
  ];

  const timeSwapPattern =
    /\b(heute|today)\b.*\b(morgen|tomorrow)\b|\b(morgen|tomorrow)\b.*\b(heute|today)\b/i;

  if (swapKeywords.some((r) => r.test(s)) || timeSwapPattern.test(s)) {
    return "swapTrainingDays";
  }

  // ADD REST DAY INTENT
  if (/\b(rest|ruhe|pause|regeneration)\b/i.test(s)) {
    return "addRestDay";
  }

  // ADJUST PLAN INTENT
  if (/\b(change|adjust|plan|train|training|intensity|volume|umfang)\b/i.test(s)) {
    return "adjustTrainingPlan";
  }

  return "general";
}
