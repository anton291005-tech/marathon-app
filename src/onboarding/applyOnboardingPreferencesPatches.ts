import { getApiBaseUrl } from "../lib/api/apiBaseUrl";
import type { AiPlanRules } from "../lib/ai/coachPlanMutations";
import type { PlanPatch } from "../lib/ai/types";
import type { TrainingPlanV2, WorkoutV2 } from "../planV2/types";

const PLAN_PAYLOAD_MAX_BYTES = 100 * 1024;
const PLAN_SAMPLE_WORKOUT_COUNT = 60;

export type OnboardingPlanRefinementProfile = {
  raceDistanceKm: number | null;
  raceDistanceLabel: string;
  raceGoal: string;
  raceTargetTime?: string | null;
  weeklyKmRange: string;
  raceDate: string | null;
  planStartDate: string;
  restDayDow?: number | null;
  userPreferences?: string[];
  planDurationDays?: number;
};

export interface OnboardingAiResult {
  rules: AiPlanRules;
  analysis: string;
}

/** Workouts for API payloads — prefers top-level array, falls back to weeks. */
export function extractPlanWorkouts(plan: TrainingPlanV2): WorkoutV2[] {
  if (Array.isArray(plan.workouts) && plan.workouts.length > 0) {
    return plan.workouts;
  }
  if (Array.isArray(plan.weeks)) {
    const fromWeeks = plan.weeks.flatMap((w) =>
      Array.isArray(w.workouts) ? w.workouts : [],
    );
    if (fromWeeks.length) return fromWeeks;
  }
  return [];
}

/** Serializable plan body for preferences-patches (workouts only; weeks omitted). */
export function buildOnboardingPlanApiPayload(plan: TrainingPlanV2): {
  plan: Pick<TrainingPlanV2, "version" | "workouts">;
  planSampleNote?: string;
} {
  const allWorkouts = extractPlanWorkouts(plan);
  let workouts = allWorkouts;
  let planSampleNote: string | undefined;

  const tryPayload = (ws: WorkoutV2[]) =>
    JSON.stringify({ version: 2 as const, workouts: ws });

  if (tryPayload(workouts).length > PLAN_PAYLOAD_MAX_BYTES) {
    workouts = allWorkouts.slice(0, PLAN_SAMPLE_WORKOUT_COUNT);
    planSampleNote = `This is a sample of the full plan (first ${PLAN_SAMPLE_WORKOUT_COUNT} workouts)`;
  }

  return {
    plan: { version: 2, workouts },
    ...(planSampleNote ? { planSampleNote } : {}),
  };
}

/** Extract JSON array from model text (strips optional markdown fences). */
export function parsePlanPatchesFromAnthropicText(text: string): PlanPatch[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(jsonText) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { patches?: unknown }).patches)
      ? (parsed as { patches: unknown[] }).patches
      : [];
  if (!Array.isArray(list)) return [];

  const out: PlanPatch[] = [];
  for (const item of list.slice(0, 150)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const sessionId = typeof row.sessionId === "string" ? row.sessionId.trim() : "";
    if (!sessionId) continue;
    const rawChanges =
      row.changes && typeof row.changes === "object" ? (row.changes as Record<string, unknown>) : {};
    const changes: PlanPatch["changes"] = {};
    if (typeof rawChanges.title === "string") changes.title = rawChanges.title;
    if (typeof rawChanges.km === "number" && Number.isFinite(rawChanges.km)) changes.km = rawChanges.km;
    if (typeof rawChanges.type === "string") changes.type = rawChanges.type as PlanPatch["changes"]["type"];
    const descSource =
      typeof rawChanges.desc === "string"
        ? rawChanges.desc
        : typeof rawChanges.notes === "string"
          ? rawChanges.notes
          : null;
    if (descSource) changes.desc = descSource;
    const reason = typeof row.reason === "string" ? row.reason : undefined;
    out.push({ sessionId, changes, ...(reason ? { reason } : {}) });
  }
  return out;
}

/**
 * Request AI training rules from the backend (profile only — no plan payload).
 */
export async function fetchOnboardingAiRules(
  profile: OnboardingPlanRefinementProfile,
): Promise<OnboardingAiResult> {
  const prefs = (profile.userPreferences ?? []).map((p) => p.trim()).filter(Boolean);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(`${getApiBaseUrl()}/api/onboarding/preferences-patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: { ...profile, userPreferences: prefs },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[ONBOARDING] AI rules request failed", res.status);
      return { rules: {}, analysis: "" };
    }

    const data = (await res.json()) as { rules?: AiPlanRules; analysis?: string };
    // eslint-disable-next-line no-console
    console.log("[AI-RULES] analysis:", data.analysis);
    // eslint-disable-next-line no-console
    console.log("[AI-RULES] rules:", JSON.stringify(data.rules));
    return {
      rules: data.rules ?? {},
      analysis: data.analysis ?? "",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ONBOARDING] AI rules request error", err);
    return { rules: {}, analysis: "" };
  }
}

/**
 * @deprecated Plan patches — onboarding uses {@link fetchOnboardingAiRules} + generator rules.
 * Returns [] when the request fails or OPENAI_API_KEY is missing.
 */
export async function fetchOnboardingPreferencePatches(
  plan: TrainingPlanV2,
  userPreferences: string[],
  profile: OnboardingPlanRefinementProfile,
): Promise<PlanPatch[]> {
  const prefs = userPreferences.map((p) => p.trim()).filter(Boolean);

  try {
    const { plan: apiPlan, planSampleNote } = buildOnboardingPlanApiPayload(plan);
    // eslint-disable-next-line no-console
    console.log("[PATCHES] profile sent:", JSON.stringify(profile));
    // eslint-disable-next-line no-console
    console.log("[PATCHES] sending plan workoutCount:", apiPlan.workouts?.length);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(`${getApiBaseUrl()}/api/onboarding/preferences-patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: apiPlan,
        userPreferences: prefs,
        profile,
        ...(planSampleNote ? { planSampleNote } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[ONBOARDING] preference patches request failed", res.status);
      return [];
    }

    const data = (await res.json()) as { patches?: unknown };
    if (!Array.isArray(data.patches)) return [];
    const patches = data.patches as PlanPatch[];
    // eslint-disable-next-line no-console
    console.log("[PATCHES] patches received:", patches.length);
    patches.forEach((p) => {
      // eslint-disable-next-line no-console
      console.log("[PATCH]", p.sessionId, p.changes, p.reason);
    });
    return patches;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ONBOARDING] preference patches request error", err);
    return [];
  }
}
