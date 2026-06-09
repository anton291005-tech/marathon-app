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

  // Date-based swap: "tausche das training vom 09.06 mit dem vom 10.06"
  const dateSwapPattern1 =
    /\b(vom\s+\d{1,2}\.\d{1,2})\b/.test(s) && /\b(tausch|swap|vertausch|mit)\b/.test(s);
  // Two date tokens present + tausch keyword (handles "09.06 und 10.06 tauschen" etc.)
  const dateSwapPattern2 =
    (s.match(/\b\d{1,2}\.\d{1,2}/g) ?? []).length >= 2 && /\b(tausch|swap|vertausch)\b/.test(s);

  if (
    swapKeywords.some((r) => r.test(s)) ||
    timeSwapPattern.test(s) ||
    dateSwapPattern1 ||
    dateSwapPattern2
  ) {
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
