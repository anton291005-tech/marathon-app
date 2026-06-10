import { getApiBaseUrl } from "../api/apiBaseUrl";
import type { AiPlanRules } from "./coachPlanMutations";
import type { TrainingPlanV2 } from "../../planV2/types";

/**
 * Strips Markdown code fences and extracts the outermost JSON object from a
 * string. Needed because some environments / proxies may wrap the API response
 * in HTML or add fence characters.
 */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw.trim();
}

export interface ClaudeRulesResult {
  rules: AiPlanRules | null;
  analysis: string;
}

export interface ClaudePlanResult {
  plan: TrainingPlanV2 | null;
  analysis: string;
}

export interface PlanGenerationProfile {
  raceDistanceKm: number | null;
  raceDistanceLabel: string;
  raceGoal: string;
  raceTargetTime?: string | null;
  weeklyKmRange: string;
  raceDate: string;
  planStartDate: string;
  planDurationDays: number;
  userPreferences: string[];
}

/** @deprecated Use fetchClaudePlan instead. */
export async function fetchClaudePlanRules(
  profile: PlanGenerationProfile,
): Promise<ClaudeRulesResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting plan rules...");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(`${getApiBaseUrl()}/api/onboarding/generate-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { rules: null, analysis: "" };

    const data = (await res.json()) as { rules?: AiPlanRules | null; analysis?: string };
    // eslint-disable-next-line no-console
    console.log("[claude-client] rules received:", JSON.stringify(data.rules));

    return {
      rules: data.rules ?? null,
      analysis: data.analysis ?? "",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[claude-client] error:", err);
    return { rules: null, analysis: "" };
  }
}

/**
 * Requests a complete TrainingPlanV2 directly from Claude via the backend.
 * Falls back to null on network / parse errors (caller should use deterministic
 * generator as fallback).
 */
export async function fetchClaudePlan(
  profile: PlanGenerationProfile,
): Promise<ClaudePlanResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting full plan...");

  try {
    const controller = new AbortController();
    // 60 s – Claude may need up to ~55 s for a long plan
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(`${getApiBaseUrl()}/api/onboarding/generate-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await res.text();

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("[claude-client] HTTP error:", res.status, rawText.slice(0, 500));
      return { plan: null, analysis: "" };
    }

    // eslint-disable-next-line no-console
    console.log("[claude-client] raw response (first 500 chars):", rawText.slice(0, 500));

    const cleaned = extractJson(rawText);
    const data = JSON.parse(cleaned) as { plan?: TrainingPlanV2 | null; analysis?: string };
    // eslint-disable-next-line no-console
    console.log("[claude-client] plan received, workouts:", data.plan?.workouts?.length ?? 0);

    return {
      plan: data.plan ?? null,
      analysis: data.analysis ?? "",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[claude-client] error:", err);
    return { plan: null, analysis: "" };
  }
}
