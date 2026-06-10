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

const FULL_PLAN_SYSTEM_PROMPT = `Du bist ein erfahrener Marathontrainer und erstellst individuelle Trainingspläne.
Erstelle einen vollständigen Trainingsplan als JSON. Der Plan muss exakt diesem Schema entsprechen:
{
  "version": 2,
  "analysis": "2-3 Sätze über diesen Läufer auf Deutsch",
  "weeks": [
    {
      "weekStartIso": "YYYY-MM-DD",
      "meta": {
        "wn": 1,
        "phase": "BASE",
        "label": "Grundlagen-Block",
        "dates": "10. Jun ff.",
        "focus": "Aerobe Basis aufbauen, Gewöhnung an Trainingsrhythmus",
        "isRecoveryWeek": false
      }
    }
  ],
  "workouts": [
    {
      "id": "w01-mo",
      "dateIso": "YYYY-MM-DD",
      "sport": "run",
      "sessionType": "easy",
      "title": "Lockerer Einstiegslauf",
      "km": 8,
      "desc": "Ruhiger Dauerlauf im aeroben Grundlagenbereich. Gespräch möglich.",
      "pace": "5:30–5:50/km",
      "intensity": "low",
      "structured": null
    }
  ]
}

Erlaubte sport-Werte: "run", "bike", "swim", "strength", "rest"
Erlaubte sessionType-Werte: "easy", "interval", "tempo", "long", "bike", "swim", "strength", "rest", "race"
Erlaubte intensity-Werte: "low", "medium", "high"
Erlaubte phase-Werte: "BASE", "BUILD", "DEV", "SPEC", "TAPER"

WICHTIGE REGELN:
- Jeder Tag vom Startdatum bis zum Renntag bekommt genau einen Workout-Eintrag
- Ruhetage haben sport="rest", sessionType="rest", km=0, pace=null
- Session-IDs Format: "w[WochenNr2stellig]-[wochentag2buchstaben]" z.B. "w01-mo", "w03-di"
- Wochentag-Kürzel: mo=Montag, di=Dienstag, mi=Mittwoch, do=Donnerstag, fr=Freitag, sa=Samstag, so=Sonntag
- weekStartIso ist immer ein Montag (oder das tatsächliche Startdatum falls der Plan nicht an einem Montag beginnt)
- Entlastungswoche jede 4. Woche: isRecoveryWeek=true, Volumen ~70% der Vorwoche
- Phasen: BASE (>10 Wochen vor Rennen), BUILD (6-10 Wochen), DEV (4-6 Wochen), SPEC (3-4 Wochen), TAPER (<3 Wochen)
- Session-Namen sollen beschreibend und abwechslungsreich sein, z.B.: "Regenerationslauf", "Progressiver Mittellauf", "GA1-Dauerlauf", "Aerober Entwicklungslauf", "Schwellenlauf", "Fahrtspiel", "Tempodauerlauf", "Kraftausdauer-Intervalle"
- Long Runs progressiv steigern bis Peak ~3-4 Wochen vor Rennen, dann reduzieren
- Niemals 2 harte Einheiten (interval/tempo) an aufeinanderfolgenden Tagen
- Präferenzen des Users vollständig berücksichtigen inkl. Schwimmen, Radfahren, Krafttraining

Antworte NUR mit dem JSON-Objekt, kein Text davor oder danach.`;

async function callClaudeForPlan(client, profile, extraInstruction) {
  const userContent = extraInstruction
    ? `${JSON.stringify(profile)}\n\n${extraInstruction}`
    : JSON.stringify(profile);

  const message = await Promise.race([
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      temperature: 0,
      system: FULL_PLAN_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), 55000),
    ),
  ]);

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean);
}

async function generateFullPlanWithClaude(profile) {
  const client = getClient();
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn("[claude-plan] ANTHROPIC_API_KEY missing");
    return null;
  }

  // eslint-disable-next-line no-console
  console.log("[claude-plan] requesting full plan for:", JSON.stringify(profile));

  try {
    const plan = await callClaudeForPlan(client, profile, null);
    // eslint-disable-next-line no-console
    console.log("[claude-plan] plan received, workouts:", plan?.workouts?.length ?? 0);
    return plan;
  } catch (firstErr) {
    // eslint-disable-next-line no-console
    console.warn("[claude-plan] first attempt failed, retrying:", firstErr?.message ?? firstErr);
    try {
      const plan = await callClaudeForPlan(
        client,
        profile,
        "Antworte NUR mit dem JSON-Objekt. Kein Text, keine Erklärungen, nur das JSON.",
      );
      // eslint-disable-next-line no-console
      console.log("[claude-plan] retry succeeded, workouts:", plan?.workouts?.length ?? 0);
      return plan;
    } catch (secondErr) {
      // eslint-disable-next-line no-console
      console.error("[claude-plan] both attempts failed:", secondErr?.message ?? secondErr);
      return null;
    }
  }
}

module.exports = { generatePlanRulesWithClaude, generateFullPlanWithClaude };
