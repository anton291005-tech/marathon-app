"use strict";

const Anthropic = require("@anthropic-ai/sdk");

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

const SYSTEM_PROMPT = `You are an expert running coach.
Analyze the runner's profile and return ONLY a JSON rules object.
These rules will be applied programmatically to every session.

Return ONLY this JSON, nothing else:
{
  "analysis": "2-3 sentences about this runner in German",
  "restDays": [1],
  "strengthDays": [],
  "bikeDays": [],
  "swimDays": [],
  "longRunDay": 0,
  "intervalDay": 2,
  "tempoDay": 4,
  "maxTrainingDaysPerWeek": 4,
  "weeklyKmMultiplier": 1.0
}

Day numbers: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 
4=Thursday, 5=Friday, 6=Saturday

RULES:
- restDays: days that are ALWAYS rest (from preferences + logical recovery)
- strengthDays: days for strength training (from preferences)
- bikeDays: days for cycling (from preferences)
- swimDays: days for swimming (from preferences)
- longRunDay: best day for long run (0=Sunday or 6=Saturday preferred)
- intervalDay: day for interval training (hard session)
- tempoDay: day for tempo run (hard session, not consecutive with intervalDay)
- maxTrainingDaysPerWeek: 3 for finish goals, 4-5 for time goals
- weeklyKmMultiplier: 0.6 for "0-20km", 0.8 for "20-40km", 
  1.0 for "40-60km", 1.2 for "60-80km", 1.4 for "80+km"

IMPORTANT: intervalDay and tempoDay must NOT be consecutive days.
strengthDays/bikeDays/swimDays override whatever session was planned.
restDays override everything.`;

function parsePreferencesToRules(prefs) {
  const days = {
    montag: "Monday",
    dienstag: "Tuesday",
    mittwoch: "Wednesday",
    donnerstag: "Thursday",
    freitag: "Friday",
    samstag: "Saturday",
    sonntag: "Sunday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  const restIndicators = [
    "kein training",
    "kein laufen",
    "ruhetag",
    "rest",
    "pause",
    "frei",
    "kein sport",
  ];
  const strengthIndicators = ["krafttraining", "strength", "kraft"];
  const bikeIndicators = ["radfahren", "cycling", "bike", "rad"];
  const swimIndicators = ["schwimmen", "swimming", "swim"];

  const rules = [];

  for (const pref of prefs) {
    const lower = pref.toLowerCase();

    let foundDay = null;
    for (const [de, en] of Object.entries(days)) {
      if (lower.includes(de)) {
        foundDay = en;
        break;
      }
    }

    if (!foundDay) {
      rules.push(`- General preference: ${pref}`);
      continue;
    }

    if (restIndicators.some((r) => lower.includes(r))) {
      rules.push(`- ${foundDay}: ALWAYS rest day`);
    } else if (strengthIndicators.some((r) => lower.includes(r))) {
      rules.push(`- ${foundDay}: ALWAYS strength training`);
    } else if (bikeIndicators.some((r) => lower.includes(r))) {
      rules.push(`- ${foundDay}: ALWAYS cycling`);
    } else if (swimIndicators.some((r) => lower.includes(r))) {
      rules.push(`- ${foundDay}: ALWAYS swimming`);
    } else {
      rules.push(`- ${foundDay}: ${pref}`);
    }
  }

  return rules.length ? rules.join("\n") : "- No special preferences";
}

function buildUserMessage(profile) {
  const prefRules = parsePreferencesToRules(profile.userPreferences ?? []);

  return `Runner profile:
- Distance: ${profile.raceDistanceLabel} (${profile.raceDistanceKm}km)
- Goal: ${profile.raceGoal === "finish" ? "Just finish" : "Target: " + profile.raceTargetTime}
- Weekly km: ${profile.weeklyKmRange}
- Plan: ${profile.planDurationDays} days
- Preferences: ${prefRules}

Return the rules JSON only.`;
}

async function generatePlanRulesWithClaude(profile) {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn("[claude-gen] ANTHROPIC_API_KEY missing");
    return null;
  }

  // eslint-disable-next-line no-console
  console.log("[claude-gen] requesting rules for:", JSON.stringify(profile));

  const message = await Promise.race([
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(profile) }],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), 30000),
    ),
  ]);

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // eslint-disable-next-line no-console
  console.log("[claude-gen] rules response:", text);

  const clean = text.replace(/```json|```/g, "").trim();
  const rules = JSON.parse(clean);

  // eslint-disable-next-line no-console
  console.log("[claude-gen] rules parsed:", JSON.stringify(rules));
  return rules;
}

const STRUCTURE_SYSTEM_PROMPT = `Du bist ein erfahrener Marathontrainer. Analysiere das Läuferprofil und gib NUR ein JSON-Objekt zurück mit: phases (Phasenstruktur), sessionNames (abwechslungsreiche Trainingsnamen pro Typ), rules (Trainingsregeln). Kein Text außerhalb des JSON. Sei präzise und kompakt.

Das JSON muss exakt diesem Schema entsprechen:
{
  "analysis": "2-3 Sätze über den Läufer auf Deutsch",
  "phases": [
    { "name": "BASE", "weeks": 6, "label": "Aerober Grundlagenblock", "focus": "Aerobe Basis aufbauen" },
    { "name": "BUILD", "weeks": 5, "label": "Entwicklungsphase", "focus": "Volumen und Intensität steigern" },
    { "name": "SPEC", "weeks": 4, "label": "Spezifische Vorbereitung", "focus": "Rennspezifische Reize setzen" },
    { "name": "TAPER", "weeks": 2, "label": "Tapering", "focus": "Erholen und schärfen" }
  ],
  "sessionNames": {
    "easy": ["Regenerationslauf", "GA1-Dauerlauf", "Lockerer Grundlagenlauf", "Aerober Entwicklungslauf", "Ruhiger Dauerlauf"],
    "tempo": ["Tempodauerlauf", "Schwellenlauf", "Progressiver Mittellauf", "Fahrtspiel", "Kraftausdauer-Lauf"],
    "interval": ["Bahnintervalle 1000m", "Kurze Intervalle 400m", "Bergläufe", "Tempoläufe 3×2km", "VO2max-Intervalle"],
    "long": ["Langer Grundlagenlauf", "Progressiver Long Run", "Marathon-Pace-Long-Run", "Ausdauer-Entwicklungslauf"],
    "bike": ["Rennrad Grundlage", "Rad Cross-Training", "Rennrad Ausdauer", "Ergometer locker"],
    "swim": ["Grundlagen-Schwimmen", "Technik-Schwimmen", "Ausdauer-Schwimmen"],
    "strength": ["Kraftausdauer", "Laufkraft-Training", "Core & Stabilität"]
  },
  "rules": {
    "restDays": [1],
    "longRunDay": 0,
    "intervalDay": 2,
    "tempoDay": 4,
    "bikeDays": [],
    "swimDays": [],
    "strengthDays": [],
    "maxTrainingDaysPerWeek": 4,
    "weeklyKmMultiplier": 1.0,
    "recoveryWeekEvery": 4
  }
}

Tag-Zahlen für rules: 0=Sonntag, 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag, 5=Freitag, 6=Samstag
intervalDay und tempoDay dürfen NICHT aufeinanderfolgend sein.
Präferenzen des Läufers vollständig berücksichtigen.`;

async function callClaudeForStructure(client, profile, extraInstruction) {
  const userContent = extraInstruction
    ? `${JSON.stringify(profile)}\n\n${extraInstruction}`
    : JSON.stringify(profile);

  // eslint-disable-next-line no-console
  console.log("[claude-structure] starting Claude call, planDurationDays:", profile?.planDurationDays ?? "?", "ts:", Date.now());

  const message = await Promise.race([
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0,
      system: STRUCTURE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), 30000),
    ),
  ]);

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // eslint-disable-next-line no-console
  console.log("[claude-structure] response (first 500):", text.slice(0, 500));

  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean);
}

async function generatePlanStructureWithClaude(profile) {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn("[claude-structure] ANTHROPIC_API_KEY missing");
    return null;
  }

  try {
    const structure = await callClaudeForStructure(client, profile, null);
    // eslint-disable-next-line no-console
    console.log("[claude-structure] structure received, phases:", structure?.phases?.length ?? 0);
    return structure;
  } catch (firstErr) {
    // eslint-disable-next-line no-console
    console.warn("[claude-structure] first attempt failed, retrying:", firstErr?.message ?? firstErr);
    try {
      const structure = await callClaudeForStructure(
        client,
        profile,
        "Antworte NUR mit dem JSON-Objekt. Kein Text, keine Erklärungen, nur das JSON.",
      );
      // eslint-disable-next-line no-console
      console.log("[claude-structure] retry succeeded");
      return structure;
    } catch (secondErr) {
      // eslint-disable-next-line no-console
      console.error("[claude-structure] both attempts failed:", secondErr?.message ?? secondErr);
      return null;
    }
  }
}

module.exports = { generatePlanRulesWithClaude, generatePlanStructureWithClaude };
