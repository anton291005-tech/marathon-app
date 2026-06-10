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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaudeRulesResult {
  rules: AiPlanRules | null;
  analysis: string;
}

/** @deprecated kept for backward compat */
export interface ClaudePlanResult {
  plan: TrainingPlanV2 | null;
  analysis: string;
}

export interface ClaudePhase {
  name: string;
  weeks: number;
  label: string;
  focus: string;
}

export interface ClaudePlanStructure {
  analysis: string;
  phases: ClaudePhase[];
  sessionNames: Record<string, string[]>;
  /** Maps directly onto AiPlanRules (with optional extra field recoveryWeekEvery). */
  rules: AiPlanRules & { recoveryWeekEvery?: number };
}

export interface ClaudePlanStructureResult {
  structure: ClaudePlanStructure | null;
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

// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------

async function postGeneratePlan(profile: PlanGenerationProfile, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    throw new Error(`HTTP ${res.status}`);
  }

  // eslint-disable-next-line no-console
  console.log("[claude-client] raw response (first 500 chars):", rawText.slice(0, 500));

  return rawText;
}

// ---------------------------------------------------------------------------
// fetchClaudePlanStructure  (primary, hybrid approach)
// ---------------------------------------------------------------------------

/**
 * Requests a compact plan structure from Claude (phases + sessionNames + rules).
 * The caller uses the deterministic generator to build the full plan and then
 * overlays Claude's personalised names and phase labels.
 */
export async function fetchClaudePlanStructure(
  profile: PlanGenerationProfile,
): Promise<ClaudePlanStructureResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting plan structure...");

  try {
    const rawText = await postGeneratePlan(profile, 45000);
    const cleaned = extractJson(rawText);
    const data = JSON.parse(cleaned) as { structure?: ClaudePlanStructure | null; analysis?: string };

    const structure = data.structure ?? null;
    // eslint-disable-next-line no-console
    console.log("[claude-client] structure received, phases:", structure?.phases?.length ?? 0);

    return {
      structure,
      analysis: data.analysis ?? structure?.analysis ?? "",
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[claude-client] fetchClaudePlanStructure error:", err);
    return { structure: null, analysis: "" };
  }
}

// ---------------------------------------------------------------------------
// fetchClaudePlanStructureDirect  (direct browser → Anthropic, bypasses Vercel)
// ---------------------------------------------------------------------------

/**
 * Calls the Anthropic API directly from the browser, bypassing the Vercel
 * serverless function (which has a 10 s timeout on the free plan).
 * Requires REACT_APP_ANTHROPIC_API_KEY to be set at build time.
 */
export async function fetchClaudePlanStructureDirect(
  profile: PlanGenerationProfile,
): Promise<ClaudePlanStructureResult> {
  const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("[claude-direct] REACT_APP_ANTHROPIC_API_KEY not set");
    return { structure: null, analysis: "" };
  }

  const systemPrompt = `Du bist ein erfahrener Marathontrainer. Analysiere das Läuferprofil und gib NUR ein JSON-Objekt zurück. Kein Text außerhalb des JSON. Sei präzise und kompakt.

Format:
{
  "analysis": "2-3 Sätze über den Läufer auf Deutsch",
  "phases": [
    { "name": "BASE", "weeks": 6, "label": "Aerober Grundlagenblock", "focus": "Basis aufbauen" },
    { "name": "BUILD", "weeks": 5, "label": "Entwicklungsphase", "focus": "Volumen steigern" },
    { "name": "SPEC", "weeks": 4, "label": "Spezifische Vorbereitung", "focus": "Rennspezifisch" },
    { "name": "TAPER", "weeks": 2, "label": "Tapering", "focus": "Erholen und schärfen" }
  ],
  "sessionNames": {
    "easy": ["Regenerationslauf", "GA1-Dauerlauf", "Lockerer Grundlagenlauf", "Aerober Entwicklungslauf", "Ruhiger Dauerlauf"],
    "tempo": ["Tempodauerlauf", "Schwellenlauf", "Progressiver Mittellauf", "Fahrtspiel", "Kraftausdauer-Lauf"],
    "interval": ["Bahnintervalle 1000m", "Kurze Intervalle 400m", "Bergläufe", "Tempoläufe 3x2km", "VO2max-Intervalle"],
    "long": ["Langer Grundlagenlauf", "Progressiver Long Run", "Marathon-Pace-Long-Run", "Ausdauer-Entwicklungslauf"],
    "bike": ["Rennrad Grundlage", "Rad Cross-Training", "Rennrad Ausdauer", "Ergometer locker"],
    "swim": ["Grundlagen-Schwimmen", "Technik-Schwimmen", "Ausdauer-Schwimmen"],
    "strength": ["Kraftausdauer", "Laufkraft-Training", "Core & Stabilität"],
    "rest": ["Ruhetag", "Aktive Erholung"]
  },
  "rules": {
    "restDays": [1],
    "longRunDay": 0,
    "intervalDay": 2,
    "tempoDay": 4,
    "bikeDays": [],
    "swimDays": [],
    "strengthDays": [],
    "maxTrainingDaysPerWeek": 5,
    "weeklyKmMultiplier": 1.0,
    "recoveryWeekEvery": 4
  }
}`;

  try {
    // eslint-disable-next-line no-console
    console.log("[claude-direct] starting plan structure call...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(profile) }],
      }),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error("[claude-direct] HTTP error:", response.status, await response.text());
      return { structure: null, analysis: "" };
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const rawText = data.content?.[0]?.text ?? "";
    // eslint-disable-next-line no-console
    console.log("[claude-direct] raw (first 300):", rawText.slice(0, 300));

    const extracted = extractJson(rawText);
    const structure = JSON.parse(extracted) as ClaudePlanStructure;
    // eslint-disable-next-line no-console
    console.log("[claude-direct] structure received, phases:", structure.phases?.length);
    return { structure, analysis: structure.analysis ?? "" };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[claude-direct] error:", err);
    return { structure: null, analysis: "" };
  }
}

// ---------------------------------------------------------------------------
// Legacy / deprecated
// ---------------------------------------------------------------------------

/** @deprecated Use fetchClaudePlanStructure instead. */
export async function fetchClaudePlanRules(
  profile: PlanGenerationProfile,
): Promise<ClaudeRulesResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting plan rules...");

  try {
    const rawText = await postGeneratePlan(profile, 45000);
    const cleaned = extractJson(rawText);
    const data = JSON.parse(cleaned) as { rules?: AiPlanRules | null; analysis?: string };
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

/** @deprecated Use fetchClaudePlanStructure instead. */
export async function fetchClaudePlan(
  profile: PlanGenerationProfile,
): Promise<ClaudePlanResult> {
  // eslint-disable-next-line no-console
  console.log("[claude-client] requesting full plan (deprecated path)...");

  try {
    const rawText = await postGeneratePlan(profile, 60000);
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
