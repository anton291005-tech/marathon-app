import { getApiBaseUrl } from "../api/apiBaseUrl";
import type { AiPlanRules } from "./coachPlanMutations";

export interface ClaudeRulesResult {
  rules: AiPlanRules | null;
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
