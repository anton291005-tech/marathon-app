require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const {
  AI_RESPONSE_SCHEMA,
  ALLOWED_ACTIONS,
  isValidAiResponse,
  collectSchemaAdditionalPropertiesViolations,
  collectSchemaRequiredCoverageViolations,
  getSchemaStrictnessSummary,
} = require("./aiSchema");
const { handleOnboardingPreferencesPatches } = require("../api/_lib/onboardingPreferencesPatches");
const { generatePlanRulesWithClaude } = require("../api/_lib/claudePlanGenerator");
const { handleDeleteAccount } = require("../api/_lib/deleteAccount");

const app = express();
const port = Number(process.env.AI_SERVER_PORT || 8787);
const defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const corsOptions = {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

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
let schemaAcceptanceLogged = false;

app.use(express.json({ limit: "1mb" }));
app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();
  return cors(corsOptions)(req, res, next);
});

function buildSystemPrompt() {
  return [
    "You are the in-app marathon training coach. Language: German for user-facing text in `message`.",
    "Data channels:",
    "- `recoveryDomain` + `recoverySummary`: authoritative for today’s readiness, fatigue bands, latent trend, uncertainty — overweight these for safety.",
    "- `trainingPlan` (either planV2 or legacy weeks), `logsLast30Days`, `healthRunsLast30Days`, plus `raceDateIso` / goals / HR cap: personalization only — cite concrete sessions (date, weekday, title, km, type) when answering plan questions.",
    "- `todayIso` is wall-clock. `availableScreens` is only for navigate_to_screen intents.",
    "Athletic readiness: NEVER contradict a low-recovery signal in `recoveryDomain` with «you’re fine» based only on the plan.",
    "`userInput` may repeat some of the structured plan in prose (client prefix) — resolve conflicts using the JSON payloads as ground truth.",
    "Hard rules — no hallucinated state:",
    "- NEVER state or imply that the race date, plan start, competition schedule, or any calendar field was changed unless the user clearly asked to shift/adjust it.",
    "- Prefer `goals.targetTime` and payload `raceDateIso` when discussing goals; treat free-text mentions as secondary.",
    "- Training science questions (e.g. road cycling in marathon training): answer with sport-science reasoning only for purely theoretical questions; set `action` to null. If the user explicitly requests a plan change (convert, replace, shift), emit the matching action — never answer with explanation-only when a concrete edit was requested.",
    "- shift_race_date only if the user clearly wants to move the race/competition date (not generic «Marathontraining» questions).",
    "Decision priority: (1) safety / avoid overload and injury, (2) sustainable training, (3) user-stated preferences when safe.",
    "Plan-specific questions («what’s Tuesday next week», weekly km totals, pacing vs goal): use `trainingPlan` + logs/health slices; cite numbers. Set `action` to null unless the user wants an edit.",
    "- Never refuse natural questions with «Ich verstehe nicht». If unclear, one short question OR a split answer.",
    "- If the user is unclear about a concrete EDIT, set `action` to null and ask one focused question.",
    "- Only attach `action` when the request maps clearly OR risk signals require it (illness, sharp pain, pushing hard while recoveryDomain indicates fatigue).",
    "Actions (suggest-only; confirmation in app):",
    "- adjust_plan_for_illness: illness, injury, overload, recovery days.",
    "- replace_bike_with_run: bike session unavailable.",
    "- convert_workout_to_run: User möchte eine Bike-/Rennrad-Einheit in ein äquivalentes Lauftraining umwandeln. Berechne selbstständig: Schätze die Dauer der Bike-Einheit (km ÷ Durchschnittsgeschwindigkeit je Intensität), mappe auf Run-Intensität (bike easy→run easy, medium→tempo, high→interval), berechne Lauf-km aus Dauer × Zielpace. Liefere sessionId, targetSessionType, targetKm, targetPace, targetTitle, targetDesc. Setze explanation mit sportswissenschaftlicher Begründung auf Deutsch. Trigger: «konvertiere», «ändere zu Lauf», «statt Rad lieber laufen», wenn die konkrete Einheit identifizierbar ist. Wenn unklar welche Einheit → eine kurze Frage. Kein Null-Action bei eindeutigem Convert-Request.",
    "- shift_race_date / shift_plan_start_date: timeline shift.",
    "- navigate_to_screen: use availableScreens.",
    "- explain_feature: conceptual only.",
    "Style: clear, actionable. No meta talk about APIs or schemas.",
    "Return only JSON matching the required schema.",
    "Allowed action types:",
    ALLOWED_ACTIONS.join(", "),
  ].join("\n");
}

function sanitizeSentence(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

// ─── Daily-coach endpoint helpers ────────────────────────────────────────────

function buildDailyCoachSystemPrompt() {
  return [
    "You are an elite marathon coach.",
    "You receive ONLY `recoveryDomain` (RecoveryDomainState). Do not assume plan details, logs, or goals that are not inside recoveryDomain.",
    "Provide a brief daily training tone recommendation from that domain snapshot.",
    "Respond ONLY with valid JSON — no markdown — in this exact shape:",
    '{ "level": "hard" | "easy" | "rest" | "alternative", "title": "Heute: [2-4 word label]", "reason": "[one direct sentence in German, max 15 words]", "details": ["detail 1", "detail 2", "detail 3"] }',
    "Rules:",
    "- Respond in German.",
    "- Be direct.",
    "- 'hard': domain indicates strong recovery (fresh band / high score) and insight supports quality.",
    "- 'rest': domain indicates fatigue band or insight warning.",
    "- 'alternative': injury-style caution in insight or very low confidence — prefer conservative cross-training language.",
    "- 'easy': default moderate.",
    "- Max 3 details, each max 8 words.",
    "- Title always starts with 'Heute: '.",
  ].join("\n");
}

function buildDailyCoachUserPrompt(recoveryDomain) {
  return JSON.stringify({ recoveryDomain });
}

const DAILY_COACH_VALID_LEVELS = ["hard", "easy", "rest", "alternative"];

function parseDailyCoachResponse(response) {
  if (!response || typeof response !== "object") return null;
  let raw = null;
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    raw = response.output_text;
  } else {
    const messageBlock = (response?.output || []).find((e) => e.type === "message");
    const textChunk = messageBlock?.content?.find((item) => item.type === "output_text");
    if (textChunk?.text) raw = textChunk.text;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (!DAILY_COACH_VALID_LEVELS.includes(parsed?.level)) return null;
  if (typeof parsed?.title !== "string" || !parsed.title.trim()) return null;
  if (typeof parsed?.reason !== "string" || !parsed.reason.trim()) return null;
  return {
    level: parsed.level,
    title: sanitizeSentence(parsed.title),
    reason: sanitizeSentence(parsed.reason),
    details: Array.isArray(parsed.details)
      ? parsed.details
        .filter((d) => typeof d === "string" && d.trim())
        .map((d) => sanitizeSentence(d))
        .slice(0, 4)
      : [],
  };
}

// ─── Recovery domain helpers (SSOT — before buildUserPayload) ────────────────

function pickRecoveryDomain(context) {
  return context?.recoveryDomain && typeof context.recoveryDomain === "object"
    ? context.recoveryDomain
    : null;
}

/** Client steers with digest + plan JSON; risk heuristics must use the real user line only. */
function extractBareUserTurn(steeredInput) {
  const s = typeof steeredInput === "string" ? steeredInput : "";
  const m = /\nNutzer:\s*([\s\S]*)$/m.exec(s);
  return m && typeof m[1] === "string" ? m[1].trim() : s.trim();
}

function recoveryBandOrdinalFromDomain(domain) {
  if (!domain || typeof domain.homeRecoveryScore0_100 !== "number") return null;
  const s = Math.max(0, Math.min(100, domain.homeRecoveryScore0_100));
  if (s < 40) return 0;
  if (s < 60) return 1;
  if (s < 80) return 2;
  return 3;
}

function nextSchedulingHintFromDomain(domain) {
  if (!domain) return "die nächste wichtige Einheit";
  const t =
    domain.insight && typeof domain.insight.text === "string" ? domain.insight.text.trim() : "";
  if (t) return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  return "die nächste wichtige Einheit";
}

// ─────────────────────────────────────────────────────────────────────────────

function buildUserPayload(input, context) {
  const todayIso = typeof context?.todayIso === "string" ? context.todayIso : "";
  const recoveryDomain = pickRecoveryDomain(context);
  const availableScreens = Array.isArray(context?.availableScreens) ? context.availableScreens : [];
  const raceDateIso = context?.raceDateIso === null || typeof context?.raceDateIso === "string" ? context.raceDateIso : null;
  const goals = context?.goals && typeof context.goals === "object" && !Array.isArray(context.goals) ? context.goals : {};
  const maxHeartRateBpm =
    typeof context?.maxHeartRateBpm === "number"
      ? context.maxHeartRateBpm
      : context?.maxHeartRateBpm === null
        ? null
        : null;
  const recoverySummary =
    context?.recoverySummary && typeof context.recoverySummary === "object" ? context.recoverySummary : null;
  const trainingPlan =
    context?.trainingPlan && typeof context.trainingPlan === "object" ? context.trainingPlan : null;
  const logsLast30Days = (() => {
    const v = context?.logsLast30Days;
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      return Object.entries(v).map(([sessionId, logEntry]) =>
        logEntry && typeof logEntry === "object" && !Array.isArray(logEntry)
          ? { sessionId, ...logEntry }
          : { sessionId: String(sessionId), logEntry },
      );
    }
    return [];
  })();
  const healthRunsLast30Days = Array.isArray(context?.healthRunsLast30Days) ? context.healthRunsLast30Days : [];
  return JSON.stringify({
    userInput: input,
    todayIso,
    raceDateIso,
    goals,
    maxHeartRateBpm,
    recoveryDomain,
    recoverySummary,
    availableScreens,
    trainingPlan,
    logsLast30Days,
    healthRunsLast30Days,
    instructions: {
      language: "German",
      actionSafety: "suggest-only-never-auto-apply",
      structuredOutput: true,
      recoverySsot:
        "Use recoveryDomain + recoverySummary for readiness; use trainingPlan + logsLast30Days + healthRunsLast30Days for schedule/volume adherence questions.",
    },
  });
}

function parseModelJson(response) {
  if (response && typeof response === "object" && response.output_parsed && typeof response.output_parsed === "object") {
    return response.output_parsed;
  }

  const outputText = response?.output_text;
  if (typeof outputText === "string" && outputText.trim().startsWith("{")) {
    return JSON.parse(outputText);
  }
  const messageBlock = (response?.output || []).find((entry) => entry.type === "message");
  const jsonChunk = messageBlock?.content?.find((item) => item.type === "output_json" && item.json && typeof item.json === "object");
  if (jsonChunk?.json) {
    return jsonChunk.json;
  }
  const textChunk = messageBlock?.content?.find((item) => item.type === "output_text" && typeof item.text === "string");
  if (textChunk?.text) {
    return JSON.parse(textChunk.text);
  }
  throw new Error("No JSON output in model response");
}

function fallbackStructuredResponse(message = "Ich konnte die Antwort nicht sauber strukturieren.", userInput = "", context = {}) {
  return normalizeAiResponseForFrontend({ message }, { userInput, context });
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableVariantIndex(seed, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  const value = String(seed || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % safeSize;
}

function parseNumeric(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function includesAnyText(text, normalizedText, terms) {
  return terms.some((term) => text.includes(term) || normalizedText.includes(normalizeText(term)));
}

function detectRiskProfile(userInput, recoveryDomain) {
  const userMessage = typeof userInput === "string" ? userInput : "";
  const text = userMessage.toLowerCase();
  const normalizedInput = normalizeText(userMessage);

  const hasFatigueByText = includesAnyText(text, normalizedInput, [
    "müde",
    "muede",
    "ermüdet",
    "ermuedet",
    "erschöpft",
    "erschoepft",
    "platt",
    "keine energie",
    "kaputt",
    "leer",
    "schlapp",
  ]);
  const wantsIntervals = includesAnyText(text, normalizedInput, [
    "intervalle",
    "interval",
    "tempo",
    "harte einheit",
    "hartes training",
  ]);
  const hasIllness = includesAnyText(text, normalizedInput, [
    "krank",
    "erkaelt",
    "erkaltet",
    "grippe",
    "fieber",
    "infekt",
    "husten",
  ]);
  const hasInjury = includesAnyText(text, normalizedInput, [
    "stechend",
    "stich",
    "knie",
    "schmerz",
    "pain",
    "sehne",
    "verletz",
  ]);
  const band = recoveryBandOrdinalFromDomain(recoveryDomain);
  const trainingLabel =
    recoveryDomain && typeof recoveryDomain.trainingRecoveryLabel === "string"
      ? recoveryDomain.trainingRecoveryLabel
      : "";
  const hasFatigueFromDomain =
    band === 0 || trainingLabel.includes("Niedrig") || trainingLabel.includes("Fatigue");
  const hasFatigue = hasFatigueByText || hasFatigueFromDomain;
  const pushIntent = includesAnyText(text, normalizedInput, ["ich will", "trotzdem", "egal", "durchziehen", "pushen"]);
  const mentionsRunning = includesAnyText(text, normalizedInput, ["lauf", "laufen", "joggen", "running"]);
  const mentionsTraining = mentionsRunning || includesAnyText(text, normalizedInput, ["training", "einheit", "workout", "intervall", "tempo"]);
  return {
    hasIllness,
    hasInjury,
    hasFatigue,
    wantsIntervals,
    mentionsRunning,
    mentionsTraining,
    pushDespiteRisk: wantsIntervals && (hasFatigue || hasIllness || hasInjury || pushIntent),
  };
}

function enforceCoachTone(text) {
  let message = sanitizeSentence(text);
  if (!message) return message;

  const directReplacements = [
    { pattern: /\bmaybe you should consider\b/gi, replacement: "Do" },
    { pattern: /\byou could\b/gi, replacement: "Do" },
    { pattern: /\bconsider\b/gi, replacement: "Do" },
    { pattern: /\bmaybe\b/gi, replacement: "" },
    { pattern: /moechtest du/gi, replacement: "Mach" },
    { pattern: /möchtest du/gi, replacement: "Mach" },
    { pattern: /koenntest du/gi, replacement: "Mach" },
    { pattern: /könntest du/gi, replacement: "Mach" },
    { pattern: /koenntest/gi, replacement: "Mach" },
    { pattern: /könntest/gi, replacement: "Mach" },
  ];
  for (const rule of directReplacements) {
    message = message.replace(rule.pattern, rule.replacement);
  }

  message = message
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .trim();

  if (message.length > 0) {
    message = `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
  }

  return message;
}

function detectImmediateHighRiskOverride(userMessage) {
  const text = typeof userMessage === "string" ? userMessage.toLowerCase() : "";
  const normalized = normalizeText(userMessage || "");
  const hasFatigue = includesAnyText(text, normalized, ["müde", "muede", "erschöpft", "erschoepft", "platt", "keine energie", "kaputt"]);
  const wantsIntervals = includesAnyText(text, normalized, ["intervalle", "interval", "tempo", "harte einheit"]);
  const hasInjury = includesAnyText(text, normalized, ["stechend", "stich", "knie", "schmerz", "verletz", "pain"]);
  const mentionsRunning = includesAnyText(text, normalized, ["lauf", "laufen", "joggen", "running"]);
  const hasIllness = includesAnyText(text, normalized, ["krank", "grippe", "fieber", "infekt", "erkaelt", "erkaltet"]);
  const mentionsTraining = includesAnyText(text, normalized, ["training", "einheit", "workout", "laufen", "intervall", "tempo"]);

  if (hasFatigue && wantsIntervals) {
    return {
      message: "Heute keine Intervalle. Du bist ermüdet und riskierst Überlastung. Mach stattdessen einen lockeren Lauf oder nimm einen Ruhetag.",
    };
  }
  if (hasInjury && mentionsRunning) {
    return {
      message: "Kein Laufen. Das Risiko für eine Verletzung ist zu hoch. Pause oder alternative Belastung.",
    };
  }
  if (hasIllness && mentionsTraining) {
    return {
      message: "Heute kein Training. Krankheit hat Priorität vor Leistung. Nimm Pause und starte erst nach klarer Symptomverbesserung wieder.",
    };
  }
  return null;
}

function hasRiskCorrectionLanguage(message) {
  const normalized = normalizeText(message);
  return ["kein", "nicht", "pause", "reduzier", "stopp", "stop", "abbrechen", "heute keine harte einheit"]
    .some((token) => normalized.includes(token));
}

function createDefaultPayload(overrides = {}) {
  return {
    reason: null,
    severity: null,
    bikeSessionId: null,
    shiftDays: null,
    requestedStartOffsetDays: null,
    requestedStartDateLabel: null,
    targetScreen: null,
    targetScreenLabel: null,
    section: null,
    sectionLabel: null,
    topic: null,
    sessionId: null,
    targetSessionType: null,
    targetKm: null,
    targetPace: null,
    targetTitle: null,
    targetDesc: null,
    explanation: null,
    ...overrides,
  };
}

function normalizePayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return createDefaultPayload();
  return createDefaultPayload({
    reason: typeof rawPayload.reason === "string" ? rawPayload.reason : rawPayload.reason ?? null,
    severity: typeof rawPayload.severity === "string" ? rawPayload.severity : rawPayload.severity ?? null,
    bikeSessionId: typeof rawPayload.bikeSessionId === "string" ? rawPayload.bikeSessionId : rawPayload.bikeSessionId ?? null,
    shiftDays: parseNumeric(rawPayload.shiftDays),
    requestedStartOffsetDays: parseNumeric(rawPayload.requestedStartOffsetDays),
    requestedStartDateLabel: typeof rawPayload.requestedStartDateLabel === "string" ? rawPayload.requestedStartDateLabel : rawPayload.requestedStartDateLabel ?? null,
    targetScreen: typeof rawPayload.targetScreen === "string" ? rawPayload.targetScreen : rawPayload.targetScreen ?? null,
    targetScreenLabel: typeof rawPayload.targetScreenLabel === "string" ? rawPayload.targetScreenLabel : rawPayload.targetScreenLabel ?? null,
    section: typeof rawPayload.section === "string" ? rawPayload.section : rawPayload.section ?? null,
    sectionLabel: typeof rawPayload.sectionLabel === "string" ? rawPayload.sectionLabel : rawPayload.sectionLabel ?? null,
    topic: typeof rawPayload.topic === "string" ? rawPayload.topic : rawPayload.topic ?? null,
    sessionId: typeof rawPayload.sessionId === "string" ? rawPayload.sessionId : rawPayload.sessionId ?? null,
    targetSessionType:
      typeof rawPayload.targetSessionType === "string" ? rawPayload.targetSessionType : rawPayload.targetSessionType ?? null,
    targetKm: parseNumeric(rawPayload.targetKm),
    targetPace: typeof rawPayload.targetPace === "string" ? rawPayload.targetPace : rawPayload.targetPace ?? null,
    targetTitle: typeof rawPayload.targetTitle === "string" ? rawPayload.targetTitle : rawPayload.targetTitle ?? null,
    targetDesc: typeof rawPayload.targetDesc === "string" ? rawPayload.targetDesc : rawPayload.targetDesc ?? null,
    explanation: typeof rawPayload.explanation === "string" ? rawPayload.explanation : rawPayload.explanation ?? null,
  });
}

function buildDefaultPreviewItems(actionType, risk, schedulingHint) {
  const hint = schedulingHint || "nächste Qualitätseinheit";
  if (actionType === "adjust_plan_for_illness") {
    if (risk.hasInjury) {
      return [
        "Heute kein Lauftraining und keine intensiven Reize.",
        "Belastung 48-72h deutlich reduzieren; nur schmerzfreie, lockere Bewegung.",
        `Vor ${hint} nur einsteigen, wenn alltags- und laufschmerzfrei.`,
      ];
    }
    if (risk.hasFatigue) {
      return [
        "Heute keine Intervalle oder Tempoeinheit.",
        "24-48h aktive Erholung mit lockerem Umfang.",
        `Dann ${hint} nur mit frischen Beinen absolvieren.`,
      ];
    }
    return [
      "2-4 Tage Laufpause bei Krankheitszeichen.",
      "Nur Spaziergang oder Mobility und nur fieberfrei.",
      "Wiedereinstieg mit 20-30 Min locker und 24h Reaktion checken.",
    ];
  }
  if (actionType === "replace_bike_with_run") {
    return [
      "Bike-Einheit wird durch lockeren Lauf ersetzt.",
      "Dauer kurz halten und Puls niedrig lassen.",
      "Keine Zusatzintensität am selben Tag.",
    ];
  }
  if (actionType === "convert_workout_to_run") {
    return [
      "Rennrad-Einheit wird in ein äquivalentes Lauftraining umgewandelt.",
      "Dauer und Intensität werden sportwissenschaftlich angeglichen.",
      "Volumen und Pace passen zum Zieltyp (Easy/Tempo/Intervall).",
    ];
  }
  return ["Konkrete Anpassung vorbereitet."];
}

function normalizePreview(rawPreview, actionType, risk, schedulingHint) {
  const title = sanitizeSentence(rawPreview?.title) || "Vorgeschlagene Anpassung";
  const items = Array.isArray(rawPreview?.items)
    ? rawPreview.items.map((item) => sanitizeSentence(item)).filter((item) => item.length > 0)
    : [];
  const safeItems = items.length > 0 ? items : buildDefaultPreviewItems(actionType, risk, schedulingHint);
  return {
    title,
    items: safeItems.slice(0, 5),
    confirmLabel: sanitizeSentence(rawPreview?.confirmLabel) || "Ja, übernehmen",
    cancelLabel: sanitizeSentence(rawPreview?.cancelLabel) || "Nein",
    secondaryLabel: sanitizeSentence(rawPreview?.secondaryLabel) || (actionType === "navigate_to_screen" ? null : "Anpassen"),
    openLabel: sanitizeSentence(rawPreview?.openLabel) || (actionType === "navigate_to_screen" ? "Öffnen" : null),
  };
}

function inferActionType(rawAction, risk) {
  if (rawAction === null) {
    return null;
  }
  const payloadActionType =
    rawAction && typeof rawAction === "object" ? rawAction.type : undefined;
  if (typeof payloadActionType === "string" && ALLOWED_ACTIONS.includes(payloadActionType)) {
    return payloadActionType;
  }
  if (risk.hasIllness || risk.hasInjury || risk.hasFatigue) return "adjust_plan_for_illness";
  return null;
}

function buildFallbackCoachMessage(userInput, risk, recoveryDomain) {
  const seed = normalizeText(userInput);
  const hint = nextSchedulingHintFromDomain(recoveryDomain);
  if (risk.hasInjury) {
    const intros = [
      "Stechender Schmerz ist ein Warnsignal, kein Trainingsreiz.",
      "Mit stechendem Schmerz riskierst du eine längere Pause.",
    ];
    const intro = intros[stableVariantIndex(seed, intros.length)];
    return `${intro} Heute kein Laufen und keine Intensität; reduziere die Last für 48–72h deutlich. Wenn der Schmerz bleibt, lass es sportmedizinisch abklären.`;
  }
  if (risk.pushDespiteRisk || risk.hasFatigue) {
    const intros = [
      "Müdigkeit plus harte Einheit ist heute die falsche Entscheidung.",
      "Du gewinnst heute nichts mit Intervallen auf müden Beinen.",
    ];
    const intro = intros[stableVariantIndex(seed, intros.length)];
    return `${intro} Heute nur locker oder kompletter Ruhetag, keine Intervalle. Qualität verschieben — Einordnung: ${hint}`;
  }
  if (risk.hasIllness) {
    const ask = seed.includes("ich bin krank")
      ? "Seit wann hast du Symptome, und hast du Fieber oder Brustsymptome? "
      : "";
    return `Krankheit geht vor Trainingsplan. ${ask}Heute 2-4 Tage Laufpause, nur Spaziergang oder Mobility wenn fieberfrei, danach 20-30 Min Testlauf mit 24h Kontrolle.`;
  }
  return `Recovery-Signal: ${hint} Heute konservativ steuern und die nächste wichtige Einheit sauber vorbereiten, statt kurzfristig zu überziehen.`;
}

function normalizeAiResponseForFrontend(payload, { userInput = "", context = {} } = {}) {
  const recoveryDomain = pickRecoveryDomain(context);
  const risk = detectRiskProfile(userInput, recoveryDomain);
  const schedulingHint = nextSchedulingHintFromDomain(recoveryDomain);
  const mode = ["coach", "navigator", "support"].includes(payload?.mode) ? payload.mode : "coach";

  let message = sanitizeSentence(payload?.message);
  if (!message) {
    message = buildFallbackCoachMessage(userInput, risk, recoveryDomain);
  } else if (risk.pushDespiteRisk && !hasRiskCorrectionLanguage(message)) {
    message = `${message} Heute keine harte Einheit; wir priorisieren Erholung für den nächsten Qualitätstag.`;
  }
  message = enforceCoachTone(message);

  const actionType = inferActionType(payload?.action, risk);
  if (!actionType) {
    return {
      mode,
      message,
      action: null,
    };
  }

  const payloadData = normalizePayload(payload?.action?.payload);
  if (actionType === "adjust_plan_for_illness" && !payloadData.reason) {
    if (risk.hasInjury) {
      payloadData.reason = "injury_signal";
      payloadData.severity = "high";
    } else if (risk.hasFatigue) {
      payloadData.reason = "high_fatigue";
      payloadData.severity = "moderate";
    } else if (risk.hasIllness) {
      payloadData.reason = "illness";
      payloadData.severity = "moderate";
    }
  }
  const preview = normalizePreview(payload?.action?.preview, actionType, risk, schedulingHint);

  return {
    mode,
    message,
    action: {
      type: actionType,
      payload: payloadData,
      preview,
    },
  };
}

function getPayloadSchemaAdditionalPropertiesFlag() {
  const actionObject = AI_RESPONSE_SCHEMA?.properties?.action?.anyOf?.find(
    (entry) => entry && entry.type === "object"
  );
  return actionObject?.properties?.payload?.additionalProperties;
}

async function callResponsesApi({ selectedModel, input, context, allowedActions, responseSchemaVersion }) {
  // eslint-disable-next-line no-console
  console.log("[ai-server] sending schema payload.additionalProperties =", getPayloadSchemaAdditionalPropertiesFlag());
  return client.responses.create({
    model: selectedModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt() }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPayload(input, context) }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: responseSchemaVersion || "ai_assistant_response_v1",
        schema: AI_RESPONSE_SCHEMA,
        strict: true,
      },
    },
    metadata: {
      allowedActions: Array.isArray(allowedActions) ? allowedActions.join(",") : ALLOWED_ACTIONS.join(","),
    },
  });
}

app.get("/ai/health", (_req, res) => {
  const schemaViolations = collectSchemaAdditionalPropertiesViolations(AI_RESPONSE_SCHEMA);
  const requiredCoverageViolations = collectSchemaRequiredCoverageViolations(AI_RESPONSE_SCHEMA);
  const payload = {
    ok: true,
    openaiConfigured: Boolean(apiKey),
    keyPrefix: apiKey ? apiKey.slice(0, 7) : null,
    model: defaultModel,
    projectConfigured: Boolean(project),
    schemaStrictObjects: schemaViolations.length === 0,
    schemaViolations,
    schemaRequiredCoverageOk: requiredCoverageViolations.length === 0,
    schemaRequiredCoverageViolations: requiredCoverageViolations,
    schemaSummary: getSchemaStrictnessSummary(),
  };
  res.json(payload);
});

app.get("/ai/schema-check", async (_req, res) => {
  const schemaViolations = collectSchemaAdditionalPropertiesViolations(AI_RESPONSE_SCHEMA);
  const requiredCoverageViolations = collectSchemaRequiredCoverageViolations(AI_RESPONSE_SCHEMA);
  return res.json({
    ok: true,
    schema: AI_RESPONSE_SCHEMA,
    summary: getSchemaStrictnessSummary(),
    schemaStrictObjects: schemaViolations.length === 0,
    schemaViolations,
    schemaRequiredCoverageOk: requiredCoverageViolations.length === 0,
    schemaRequiredCoverageViolations: requiredCoverageViolations,
  });
});

app.post("/ai", async (req, res) => {
  const { input, context, allowedActions, responseSchemaVersion, model: modelOverride } = req.body || {};
  if (typeof input !== "string" || !input.trim()) {
    return res.status(400).json({ error: "Invalid input" });
  }
  if (!context || typeof context !== "object") {
    return res.status(400).json({ error: "Invalid context" });
  }
  if (!pickRecoveryDomain(context)) {
    return res.status(400).json({ error: "Invalid context: recoveryDomain required" });
  }

  const bareUser = extractBareUserTurn(input);
  const override = detectImmediateHighRiskOverride(bareUser);
  if (override) {
    // eslint-disable-next-line no-console
    console.log("OVERRIDE TRIGGERED", bareUser);
    return res.status(200).json({
      mode: "coach",
      message: override.message,
      override: true,
    });
  }

  if (!client) {
    return res.status(503).json({ error: "OPENAI_API_KEY missing" });
  }

  try {
    res.on("finish", () => {
      // eslint-disable-next-line no-console
      console.log(`[ai-server] response finished status=${res.statusCode}`);
    });
    const selectedModel = typeof modelOverride === "string" && modelOverride.trim() ? modelOverride : defaultModel;
    // eslint-disable-next-line no-console
    console.log(`[ai-server] /api/ai request model=${selectedModel} key_present=${Boolean(apiKey)}`);
    const completion = await callResponsesApi({
      selectedModel,
      input,
      context,
      allowedActions,
      responseSchemaVersion,
    });
    // eslint-disable-next-line no-console
    console.log("[ai-server] OpenAI response received", {
      id: completion?.id || null,
      status: completion?.status || null,
      hasOutputParsed: Boolean(completion?.output_parsed),
      hasOutputText: typeof completion?.output_text === "string" && completion.output_text.length > 0,
      outputItems: Array.isArray(completion?.output) ? completion.output.length : 0,
    });

    let normalized;
    try {
      const payload = parseModelJson(completion);
      // eslint-disable-next-line no-console
      console.log("[ai-server] extracted structured output", payload);
      normalized = normalizeAiResponseForFrontend(payload, { userInput: bareUser, context });
    } catch (parseError) {
      // eslint-disable-next-line no-console
      console.error("[ai-server] parse failure, using fallback", {
        message: typeof parseError?.message === "string" ? parseError.message : "unknown",
      });
      normalized = fallbackStructuredResponse(undefined, bareUser, context);
    }

    if (!normalized) {
      normalized = fallbackStructuredResponse(undefined, bareUser, context);
    }

    if (!isValidAiResponse(normalized)) {
      // eslint-disable-next-line no-console
      console.error("[ai-server] normalized payload invalid, using fallback");
      normalized = fallbackStructuredResponse(undefined, bareUser, context);
    }
    if (!schemaAcceptanceLogged) {
      // eslint-disable-next-line no-console
      console.log("[ai-server] OpenAI accepted structured schema for /api/ai");
      schemaAcceptanceLogged = true;
    }
    // eslint-disable-next-line no-console
    console.log("[ai-server] sending response payload", normalized);
    const result = res.status(200).json(normalized);
    // eslint-disable-next-line no-console
    console.log("[ai-server] res.json dispatched");
    return result;
  } catch (error) {
    const status = error?.status || 500;
    // eslint-disable-next-line no-console
    console.error("[ai-server] OpenAI error", {
      status,
      code: error?.code || null,
      type: error?.type || null,
      message: typeof error?.message === "string" ? error.message : "unknown",
      keyPrefix: apiKey ? apiKey.slice(0, 7) : null,
      model: typeof modelOverride === "string" && modelOverride.trim() ? modelOverride : defaultModel,
    });
    const fallback = fallbackStructuredResponse("Ich konnte die Antwort nicht sauber strukturieren.", bareUser, context);
    // eslint-disable-next-line no-console
    console.log(`[ai-server] returning fallback due to OpenAI error status=${status}`);
    return res.status(200).json(fallback);
  }
});

app.delete("/account", async (req, res) => {
  // eslint-disable-next-line no-console
  console.log(
    "[DELETE /account] called, headers:",
    req.headers.authorization?.substring(0, 20),
  );
  try {
    const { status, body } = await handleDeleteAccount(req);
    if (status >= 400) {
      // eslint-disable-next-line no-console
      console.error("[DELETE /account] responding with error:", status, body);
    }
    return res.status(status).json(body);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[DELETE /account] error:",
      error?.message,
      error?.status,
      JSON.stringify(error),
    );
    const errBody = { error: "Account deletion failed" };
    // eslint-disable-next-line no-console
    console.error("[DELETE /account] responding with error:", 500, errBody);
    return res.status(500).json(errBody);
  }
});

app.post("/onboarding/preferences-patches", async (req, res) => {
  // eslint-disable-next-line no-console
  console.log("[API] POST /onboarding/preferences-patches called");
  try {
    const { status, body } = await handleOnboardingPreferencesPatches(req.body);
    return res.status(status).json(body);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai-server] /onboarding/preferences-patches error", {
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    return res.status(200).json({ rules: {}, analysis: "" });
  }
});

app.post("/onboarding/generate-plan", async (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) {
      return res.status(400).json({ error: "profile required" });
    }

    // eslint-disable-next-line no-console
    console.log("[API] POST /onboarding/generate-plan called");

    const rules = await generatePlanRulesWithClaude(profile);

    return res.status(200).json({
      rules: rules ?? null,
      analysis: rules?.analysis ?? "",
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[API] /onboarding/generate-plan error:",
      typeof error?.message === "string" ? error.message : "unknown",
    );
    return res.status(200).json({ rules: null, analysis: "" });
  }
});

app.post("/ai/daily-coach", async (req, res) => {
  const body = req.body || {};
  const recoveryDomain = body.recoveryDomain ?? body.coachContext?.recoveryDomain;
  if (!recoveryDomain || typeof recoveryDomain !== "object") {
    return res.status(400).json({ error: "Invalid recoveryDomain" });
  }
  if (!client) {
    return res.status(200).json({ fallback: true, reason: "no_client" });
  }
  try {
    const completion = await client.responses.create({
      model: defaultModel,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildDailyCoachSystemPrompt() }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildDailyCoachUserPrompt(recoveryDomain) }],
        },
      ],
      text: { format: { type: "json_object" } },
    });
    const parsed = parseDailyCoachResponse(completion);
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn("[ai-server] /api/ai/daily-coach: unparseable response, using fallback");
      return res.status(200).json({ fallback: true });
    }
    // eslint-disable-next-line no-console
    console.log("[ai-server] /api/ai/daily-coach response", parsed);
    return res.status(200).json(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[ai-server] /api/ai/daily-coach error", {
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    return res.status(200).json({ fallback: true });
  }
});

// eslint-disable-next-line no-console
console.log("[ai-server] DELETE /account handler registered:", typeof handleDeleteAccount);
// eslint-disable-next-line no-console
console.log(
  "[ai-server] service role key present:",
  !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  "prefix:",
  process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 8),
);

app.listen(port, () => {
  const schemaViolations = collectSchemaAdditionalPropertiesViolations(AI_RESPONSE_SCHEMA);
  const requiredCoverageViolations = collectSchemaRequiredCoverageViolations(AI_RESPONSE_SCHEMA);
  const summary = getSchemaStrictnessSummary();
  // eslint-disable-next-line no-console
  console.log(
    `[ai-server] listening on http://localhost:${port} model=${defaultModel} key_present=${Boolean(apiKey)} key_prefix=${apiKey ? apiKey.slice(0, 7) : "none"}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[ai-server] schema additionalProperties strict=${schemaViolations.length === 0} violations=${schemaViolations.length}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[ai-server] schema strictness ready payload.additionalProperties===false -> ${summary.payloadAdditionalProperties === false}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[ai-server] routes: POST /ai, POST /ai/daily-coach, POST /onboarding/preferences-patches, POST /onboarding/generate-plan, DELETE /account, GET /ai/health`
  );
});
