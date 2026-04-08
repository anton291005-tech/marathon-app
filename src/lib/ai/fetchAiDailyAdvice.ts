/**
 * Calls the /api/ai/daily-coach endpoint and returns a partial DailyCoachDecision.
 * Returns null when the server is unavailable, the call fails, or the response is
 * a declared fallback — the caller falls back to the rule-based decision in all
 * those cases.
 *
 * This function is intentionally isolated so the rest of the app is not
 * coupled to the AI endpoint format.
 */

import type { DailyCoachDecision, DailyCoachDecisionInput } from "./getDailyCoachDecision";

function aiApiBaseUrl(): string {
  if (typeof process === "undefined" || !process.env) return "";
  const raw = process.env.REACT_APP_AI_API_BASE;
  return (typeof raw === "string" ? raw : "").replace(/\/$/, "");
}

export type AiDailyAdvice = Pick<
  DailyCoachDecision,
  "level" | "title" | "reason" | "details"
>;

const VALID_LEVELS = new Set(["hard", "easy", "rest", "alternative"]);

export async function fetchAiDailyAdvice(
  input: DailyCoachDecisionInput,
  signal?: AbortSignal,
): Promise<AiDailyAdvice | null> {
  try {
    const res = await fetch(`${aiApiBaseUrl()}/api/ai/daily-coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachContext: input }),
      signal,
    });
    if (!res.ok) return null;
    const data: Record<string, unknown> = await res.json();
    // Server signals it could not produce a structured answer.
    if (data?.fallback) return null;
    if (!VALID_LEVELS.has(data?.level as string)) return null;
    if (typeof data?.title !== "string" || !data.title) return null;
    if (typeof data?.reason !== "string" || !data.reason) return null;
    return {
      level: data.level as AiDailyAdvice["level"],
      title: data.title as string,
      reason: data.reason as string,
      details: Array.isArray(data.details)
        ? (data.details as string[]).filter((d) => typeof d === "string" && d)
        : [],
    };
  } catch {
    // Network error, abort, or parse error — all treated as no AI advice.
    return null;
  }
}
