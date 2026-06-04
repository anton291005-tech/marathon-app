"use strict";

const OpenAI = require("openai");

const ONBOARDING_PREFS_MODEL = "gpt-4o";

const SYSTEM_PROMPT = `You are an expert running coach.
You receive a runner's profile and return training RULES (not patches).
These rules will be applied to every single session in the plan automatically.

Return ONLY this JSON (no explanation, no markdown):
{
  "analysis": "2-3 sentence assessment",
  "rules": {
    "restDays": [1],
    "strengthDays": [],
    "crossTrainingDays": [],
    "maxTrainingDaysPerWeek": 4,
    "longRunDay": 0,
    "intervalDay": 2,
    "tempoDay": 4,
    "easyDays": [3, 6],
    "volumeAdjustment": 1.0
  }
}

Rules explanation:
- restDays: day-of-week numbers (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
  that should ALWAYS be rest days throughout entire plan
- strengthDays: days for strength training (Krafttraining)
- crossTrainingDays: days for cycling/swimming instead of running
- maxTrainingDaysPerWeek: 3-6 depending on goal and distance
- longRunDay: which day gets the long run (usually 0=Sun or 6=Sat)
- intervalDay: which day gets intervals (hard session)
- tempoDay: which day gets tempo run (hard session)
- easyDays: remaining training days get easy runs
- volumeAdjustment: 0.7-1.3 multiplier for all km values

GUIDELINES:
- 5km/10km just finish: maxTrainingDays 3-4, restDays at least 3 days
- 5km/10km time goal: maxTrainingDays 4-5
- Half marathon finish: maxTrainingDays 4
- Half marathon time goal: maxTrainingDays 5
- Marathon finish: maxTrainingDays 4-5
- Marathon sub-4h: maxTrainingDays 5
- Marathon sub-3h30: maxTrainingDays 5-6
- Marathon sub-3h: maxTrainingDays 6
- Never put intervalDay and tempoDay on consecutive days
- longRunDay must not be a restDay
- strengthDays replace easy runs on those days
- crossTrainingDays replace easy runs on those days
- If user says "kein Training Dienstag" → add 2 to restDays
- If user says "Krafttraining Freitags" → add 5 to strengthDays
- volumeAdjustment: "20-40 km" → 0.7, "40-60 km" → 1.0,
  "60-80 km" → 1.2, "80+ km" → 1.4`;

function readEnvTrimmed(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

const apiKey = readEnvTrimmed("OPENAI_API_KEY");
const project = readEnvTrimmed("OPENAI_PROJECT");
const organization = readEnvTrimmed("OPENAI_ORG");

const client = apiKey
  ? new OpenAI({
      apiKey,
      ...(project ? { project } : {}),
      ...(organization ? { organization } : {}),
    })
  : null;

function ensureParsedBody(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeDowArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const n of value) {
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6) {
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

function normalizeDow(value, fallback) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value;
  }
  return fallback;
}

function normalizeRules(raw) {
  if (!raw || typeof raw !== "object") return {};
  const rules = {};
  const restDays = normalizeDowArray(raw.restDays);
  if (restDays.length) rules.restDays = restDays;
  const strengthDays = normalizeDowArray(raw.strengthDays);
  if (strengthDays.length) rules.strengthDays = strengthDays;
  const crossTrainingDays = normalizeDowArray(raw.crossTrainingDays);
  if (crossTrainingDays.length) rules.crossTrainingDays = crossTrainingDays;
  const easyDays = normalizeDowArray(raw.easyDays);
  if (easyDays.length) rules.easyDays = easyDays;
  if (
    typeof raw.maxTrainingDaysPerWeek === "number" &&
    Number.isFinite(raw.maxTrainingDaysPerWeek) &&
    raw.maxTrainingDaysPerWeek >= 3 &&
    raw.maxTrainingDaysPerWeek <= 6
  ) {
    rules.maxTrainingDaysPerWeek = Math.round(raw.maxTrainingDaysPerWeek);
  }
  rules.longRunDay = normalizeDow(raw.longRunDay, 0);
  rules.intervalDay = normalizeDow(raw.intervalDay, 2);
  rules.tempoDay = normalizeDow(raw.tempoDay, 4);
  if (
    typeof raw.volumeAdjustment === "number" &&
    Number.isFinite(raw.volumeAdjustment) &&
    raw.volumeAdjustment >= 0.5 &&
    raw.volumeAdjustment <= 1.5
  ) {
    rules.volumeAdjustment = raw.volumeAdjustment;
  }
  return rules;
}

function buildUserMessage(profile) {
  const prefs =
    Array.isArray(profile.userPreferences) && profile.userPreferences.length
      ? profile.userPreferences.join(", ")
      : "none";
  const goalLine =
    profile.raceGoal === "finish"
      ? "Just finish (comfortable completion)"
      : `Target time: ${profile.raceTargetTime ?? "not specified"}`;
  return `Runner Profile:
- Race distance: ${profile.raceDistanceLabel ?? "Marathon"} (${profile.raceDistanceKm ?? "?"} km)
- Goal: ${goalLine}
- Weekly km preference: ${profile.weeklyKmRange ?? "unknown"}
- Race date: ${profile.raceDate ?? "not specified"}
- Plan duration: ${profile.planDurationDays ?? "?"} days
- Personal preferences: ${prefs}
- Current rest day (from preferences): ${profile.restDayDow ?? "not specified"}

Based on this profile, return the optimal training rules as JSON.`;
}

function parseRulesFromModelText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { rules: {}, analysis: "" };
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { rules: {}, analysis: "" };
  }
  const analysis =
    parsed && typeof parsed === "object" && typeof parsed.analysis === "string"
      ? parsed.analysis.trim()
      : "";
  const rules = normalizeRules(parsed?.rules);
  return { rules, analysis };
}

/** @deprecated — kept for tests; onboarding now uses rules */
function parsePlanPatchesFromModelText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { patches: [], analysis: null };
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { patches: [], analysis: null };
  }
  const analysis =
    parsed && typeof parsed.analysis === "string" ? parsed.analysis.trim() : null;
  const rawList = Array.isArray(parsed?.patches) ? parsed.patches : [];
  const out = [];
  for (const item of rawList.slice(0, 150)) {
    if (!item || typeof item !== "object") continue;
    const sessionId = typeof item.sessionId === "string" ? item.sessionId.trim() : "";
    if (!sessionId) continue;
    const rawChanges =
      item.changes && typeof item.changes === "object" ? item.changes : {};
    const changes = {};
    if (typeof rawChanges.title === "string") changes.title = rawChanges.title;
    if (typeof rawChanges.km === "number" && Number.isFinite(rawChanges.km)) changes.km = rawChanges.km;
    if (typeof rawChanges.type === "string") changes.type = rawChanges.type;
    const descSource =
      typeof rawChanges.desc === "string"
        ? rawChanges.desc
        : typeof rawChanges.notes === "string"
          ? rawChanges.notes
          : null;
    if (descSource) changes.desc = descSource;
    const patch = { sessionId, changes };
    if (typeof item.reason === "string" && item.reason.trim()) {
      patch.reason = item.reason.trim();
    }
    out.push(patch);
  }
  return { patches: out, analysis };
}

/**
 * @param {unknown} rawBody
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleOnboardingPreferencesPatches(rawBody) {
  const body = ensureParsedBody(rawBody);
  const profile = body.profile;

  if (!profile || typeof profile !== "object") {
    return { status: 400, body: { error: "profile required" } };
  }

  const prefs = Array.isArray(profile.userPreferences)
    ? profile.userPreferences
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean)
    : Array.isArray(body.userPreferences)
      ? body.userPreferences
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter(Boolean)
      : [];

  const runnerProfile = {
    raceDistanceKm: profile.raceDistanceKm ?? null,
    raceDistanceLabel:
      typeof profile.raceDistanceLabel === "string" ? profile.raceDistanceLabel : "Marathon",
    raceGoal: typeof profile.raceGoal === "string" ? profile.raceGoal : "finish",
    raceTargetTime: profile.raceTargetTime ?? null,
    weeklyKmRange:
      typeof profile.weeklyKmRange === "string" ? profile.weeklyKmRange : "unknown",
    raceDate: profile.raceDate ?? null,
    planDurationDays:
      typeof profile.planDurationDays === "number" && Number.isFinite(profile.planDurationDays)
        ? profile.planDurationDays
        : null,
    restDayDow: profile.restDayDow ?? null,
    userPreferences: prefs,
  };

  if (!client) {
    // eslint-disable-next-line no-console
    console.warn("[onboarding] OPENAI_API_KEY missing — skipping AI rules");
    return { status: 200, body: { rules: {}, analysis: "" } };
  }

  // eslint-disable-next-line no-console
  console.log("[AI-RULES] profile:", JSON.stringify(runnerProfile));

  try {
    const userContent = buildUserMessage(runnerProfile);
    const completion = await client.chat.completions.create({
      model: ONBOARDING_PREFS_MODEL,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    const text = completion.choices?.[0]?.message?.content;
    if (!text) {
      return { status: 200, body: { rules: {}, analysis: "" } };
    }
    const { rules, analysis } = parseRulesFromModelText(text);
    // eslint-disable-next-line no-console
    console.log("[AI-RULES] analysis:", analysis);
    // eslint-disable-next-line no-console
    console.log("[AI-RULES] rules:", JSON.stringify(rules));
    return { status: 200, body: { rules, analysis } };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[onboarding] OpenAI rules error", {
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    return { status: 200, body: { rules: {}, analysis: "" } };
  }
}

module.exports = {
  handleOnboardingPreferencesPatches,
  parsePlanPatchesFromModelText,
  parseRulesFromModelText,
  buildUserMessage,
};
