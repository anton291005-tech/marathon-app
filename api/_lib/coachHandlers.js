"use strict";

/**
 * Shared coaching logic for Vercel serverless functions.
 *
 * This module is a framework-free extract of server/index.js.
 * All handler functions receive a plain request body object and return
 * { status: number, body: object } — no Express or http dependencies.
 *
 * The Express dev server (server/index.js) still uses its own copy of this
 * logic for local development. Both files must be kept in sync manually.
 */

const OpenAI = require("openai");
// Deliberately use a local copy so this directory is fully self-contained.
// Do NOT change this back to "../../server/aiSchema" — that file is not always
// committed to git and would cause a MODULE_NOT_FOUND error on Vercel.
const {
  AI_RESPONSE_SCHEMA,
  ALLOWED_ACTIONS,
  isValidAiResponse,
} = require("./aiSchema");

// ─── OpenAI client ────────────────────────────────────────────────────────────

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
const defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = apiKey
  ? new OpenAI({
    apiKey,
    ...(project ? { project } : {}),
    ...(organization ? { organization } : {}),
  })
  : null;

// ─── Pure utilities ──────────────────────────────────────────────────────────

function sanitizeSentence(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
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

function pickNumber(source, paths) {
  if (!source || typeof source !== "object") return null;
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce((obj, key) => (obj && typeof obj === "object" ? obj[key] : undefined), source);
    const numeric = parseNumeric(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function includesAnyText(text, normalizedText, terms) {
  return terms.some(
    (term) => text.includes(term) || normalizedText.includes(normalizeText(term))
  );
}

// ─── Context derivation ──────────────────────────────────────────────────────

function summarizeRecentLoad(context) {
  const logs = context?.logs && typeof context.logs === "object" ? context.logs : {};
  const planSessions = Array.isArray(context?.plan)
    ? context.plan.flatMap((week) => (Array.isArray(week?.s) ? week.s : []))
    : [];
  const sessionById = new Map(planSessions.map((session) => [session.id, session]));
  const now = new Date(context?.todayIso || Date.now());
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  let doneSessions = 0;
  let totalKm = 0;
  let hardSessions = 0;
  const feelings = [];

  for (const [sessionId, log] of Object.entries(logs)) {
    if (!log || typeof log !== "object") continue;
    if (!log.done) continue;
    const at = typeof log.at === "string" ? Date.parse(log.at) : NaN;
    if (Number.isFinite(at) && now.getTime() - at > sevenDaysMs) continue;
    doneSessions += 1;
    const plannedSession = sessionById.get(sessionId);
    const plannedKm = parseNumeric(plannedSession?.km) || 0;
    const actualKm = parseNumeric(log.actualKm);
    totalKm += actualKm !== null ? actualKm : plannedKm;
    const type = normalizeText(plannedSession?.type);
    if (["interval", "tempo", "race", "long"].includes(type)) hardSessions += 1;
    const feeling = parseNumeric(log.feeling);
    if (feeling !== null) feelings.push(feeling);
  }

  const avgFeeling =
    feelings.length
      ? feelings.reduce((sum, value) => sum + value, 0) / feelings.length
      : null;
  return {
    doneSessions,
    totalKm: Number(totalKm.toFixed(1)),
    hardSessions,
    avgFeeling: avgFeeling === null ? null : Number(avgFeeling.toFixed(2)),
  };
}

function findNextKeySession(context) {
  const sessions = Array.isArray(context?.next14Days) ? context.next14Days : [];
  if (!sessions.length) return null;
  const key =
    sessions.find((session) =>
      ["interval", "tempo", "long", "race"].includes(session?.type)
    ) || sessions[0];
  if (!key) return null;
  const day = sanitizeSentence(key.day || "");
  const date = sanitizeSentence(key.date || "");
  const title = sanitizeSentence(key.title || key.type || "Einheit");
  const km = parseNumeric(key.km);
  return `${day} ${date} - ${title}${km !== null ? ` (${km} km)` : ""}`.trim();
}

function deriveCoachContext(context) {
  const settings =
    context?.settings && typeof context.settings === "object" ? context.settings : {};
  const recent = summarizeRecentLoad(context);
  const readiness = pickNumber(settings, [
    "readiness",
    "readinessScore",
    "metrics.readiness",
    "signals.readiness",
  ]);
  const fatigue = pickNumber(settings, [
    "fatigue",
    "fatigueScore",
    "metrics.fatigue",
    "signals.fatigue",
  ]);
  const sleepHours = pickNumber(settings, [
    "sleepHours",
    "sleep.hours",
    "metrics.sleepHours",
    "signals.sleepHours",
  ]);
  return {
    target: context?.goals?.targetTime || "sub 2:50 marathon",
    currentPhase:
      Array.isArray(context?.plan) && context.plan[0]?.phase
        ? String(context.plan[0].phase)
        : null,
    recentLoad7d: recent,
    readiness,
    fatigue,
    sleepHours,
    nextKeySession: findNextKeySession(context),
  };
}

// ─── Risk detection ──────────────────────────────────────────────────────────

function detectRiskProfile(userInput, contextSummary) {
  const userMessage = typeof userInput === "string" ? userInput : "";
  const text = userMessage.toLowerCase();
  const normalizedInput = normalizeText(userMessage);

  const hasFatigueByText = includesAnyText(text, normalizedInput, [
    "müde", "muede", "ermüdet", "ermuedet",
    "erschöpft", "erschoepft", "platt",
    "keine energie", "kaputt", "leer", "schlapp",
  ]);
  const wantsIntervals = includesAnyText(text, normalizedInput, [
    "intervalle", "interval", "tempo", "harte einheit", "hartes training",
  ]);
  const hasIllness = includesAnyText(text, normalizedInput, [
    "krank", "erkaelt", "erkaltet", "grippe", "fieber", "infekt", "husten",
  ]);
  const hasInjury = includesAnyText(text, normalizedInput, [
    "stechend", "stich", "knie", "schmerz", "pain", "sehne", "verletz",
  ]);
  const hasFatigue =
    hasFatigueByText ||
    (contextSummary?.fatigue !== null && contextSummary?.fatigue >= 0.7) ||
    (contextSummary?.readiness !== null && contextSummary?.readiness <= 0.45) ||
    (contextSummary?.recentLoad7d?.avgFeeling !== null &&
      contextSummary.recentLoad7d.avgFeeling <= 2.6);
  const pushIntent = includesAnyText(text, normalizedInput, [
    "ich will", "trotzdem", "egal", "durchziehen", "pushen",
  ]);
  const mentionsRunning = includesAnyText(text, normalizedInput, [
    "lauf", "laufen", "joggen", "running",
  ]);
  const mentionsTraining =
    mentionsRunning ||
    includesAnyText(text, normalizedInput, [
      "training", "einheit", "workout", "intervall", "tempo",
    ]);
  return {
    hasIllness,
    hasInjury,
    hasFatigue,
    wantsIntervals,
    mentionsRunning,
    mentionsTraining,
    pushDespiteRisk:
      wantsIntervals && (hasFatigue || hasIllness || hasInjury || pushIntent),
  };
}

function detectImmediateHighRiskOverride(userMessage) {
  const text = typeof userMessage === "string" ? userMessage.toLowerCase() : "";
  const normalized = normalizeText(userMessage || "");
  const hasFatigue = includesAnyText(text, normalized, [
    "müde", "muede", "erschöpft", "erschoepft", "platt", "keine energie", "kaputt",
  ]);
  const wantsIntervals = includesAnyText(text, normalized, [
    "intervalle", "interval", "tempo", "harte einheit",
  ]);
  const hasInjury = includesAnyText(text, normalized, [
    "stechend", "stich", "knie", "schmerz", "verletz", "pain",
  ]);
  const mentionsRunning = includesAnyText(text, normalized, [
    "lauf", "laufen", "joggen", "running",
  ]);
  const hasIllness = includesAnyText(text, normalized, [
    "krank", "grippe", "fieber", "infekt", "erkaelt", "erkaltet",
  ]);
  const mentionsTraining = includesAnyText(text, normalized, [
    "training", "einheit", "workout", "laufen", "intervall", "tempo",
  ]);

  if (hasFatigue && wantsIntervals) {
    return {
      message:
        "Heute keine Intervalle. Du bist ermuedet und riskierst Ueberlastung. Mach stattdessen einen lockeren Lauf oder nimm einen Ruhetag.",
    };
  }
  if (hasInjury && mentionsRunning) {
    return {
      message:
        "Kein Laufen. Das Risiko fuer eine Verletzung ist zu hoch. Pause oder alternative Belastung.",
    };
  }
  if (hasIllness && mentionsTraining) {
    return {
      message:
        "Heute kein Training. Krankheit hat Prioritaet vor Leistung. Nimm Pause und starte erst nach klarer Symptomverbesserung wieder.",
    };
  }
  return null;
}

// ─── Response normalization ──────────────────────────────────────────────────

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
    .replace(/\?+/g, ".")
    .replace(/\.\.+/g, ".")
    .trim();
  if (message.length > 0) {
    message = `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
  }
  return message;
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
  });
}

function buildDefaultPreviewItems(actionType, risk, contextSummary) {
  const nextKeySession = contextSummary?.nextKeySession || "naechste Qualitaetseinheit";
  if (actionType === "adjust_plan_for_illness") {
    if (risk.hasInjury) {
      return [
        "Heute kein Lauftraining und keine intensiven Reize.",
        "Belastung 48-72h deutlich reduzieren; nur schmerzfreie, lockere Bewegung.",
        `Vor ${nextKeySession} nur einsteigen, wenn alltags- und laufschmerzfrei.`,
      ];
    }
    if (risk.hasFatigue) {
      return [
        "Heute keine Intervalle oder Tempoeinheit.",
        "24-48h aktive Erholung mit lockerem Umfang.",
        `Dann ${nextKeySession} nur mit frischen Beinen absolvieren.`,
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
      "Keine Zusatzintensitaet am selben Tag.",
    ];
  }
  return ["Konkrete Anpassung vorbereitet."];
}

function normalizePreview(rawPreview, actionType, risk, contextSummary) {
  const title = sanitizeSentence(rawPreview?.title) || "Vorgeschlagene Anpassung";
  const items = Array.isArray(rawPreview?.items)
    ? rawPreview.items.map((item) => sanitizeSentence(item)).filter((item) => item.length > 0)
    : [];
  const safeItems =
    items.length > 0 ? items : buildDefaultPreviewItems(actionType, risk, contextSummary);
  return {
    title,
    items: safeItems.slice(0, 5),
    confirmLabel: sanitizeSentence(rawPreview?.confirmLabel) || "Uebernehmen",
    cancelLabel: sanitizeSentence(rawPreview?.cancelLabel) || "Abbrechen",
    secondaryLabel:
      sanitizeSentence(rawPreview?.secondaryLabel) ||
      (actionType === "navigate_to_screen" ? null : "Bearbeiten"),
    openLabel:
      sanitizeSentence(rawPreview?.openLabel) ||
      (actionType === "navigate_to_screen" ? "Oeffnen" : null),
  };
}

function inferActionType(payloadActionType, risk) {
  if (typeof payloadActionType === "string" && ALLOWED_ACTIONS.includes(payloadActionType)) {
    return payloadActionType;
  }
  if (risk.hasIllness || risk.hasInjury || risk.hasFatigue) return "adjust_plan_for_illness";
  return null;
}

function buildFallbackCoachMessage(userInput, risk, contextSummary) {
  const seed = normalizeText(userInput);
  if (risk.hasInjury) {
    const intros = [
      "Stechender Schmerz ist ein Warnsignal, kein Trainingsreiz.",
      "Mit stechendem Schmerz riskierst du eine laengere Pause.",
    ];
    const intro = intros[stableVariantIndex(seed, intros.length)];
    return `${intro} Heute kein Laufen und keine Intensitaet; reduziere die Last fuer 48-72h deutlich. Wenn der Schmerz bleibt, lass es sportmedizinisch abklaeren.`;
  }
  if (risk.pushDespiteRisk || risk.hasFatigue) {
    const intros = [
      "Muedigkeit plus harte Einheit ist heute die falsche Entscheidung.",
      "Du gewinnst heute nichts mit Intervallen auf mueden Beinen.",
    ];
    const intro = intros[stableVariantIndex(seed, intros.length)];
    const nextKey = contextSummary?.nextKeySession
      ? `Schiebe die Qualitaet auf ${contextSummary.nextKeySession}.`
      : "Schiebe die Qualitaet auf den naechsten frischen Tag.";
    return `${intro} Heute nur locker oder kompletter Ruhetag, keine Intervalle. ${nextKey}`;
  }
  if (risk.hasIllness) {
    const ask = seed.includes("ich bin krank")
      ? "Seit wann hast du Symptome, und hast du Fieber oder Brustsymptome? "
      : "";
    return `Krankheit geht vor Trainingsplan. ${ask}Heute 2-4 Tage Laufpause, nur Spaziergang oder Mobility wenn fieberfrei, danach 20-30 Min Testlauf mit 24h Kontrolle.`;
  }
  const loadHint = contextSummary?.recentLoad7d?.doneSessions
    ? `Die letzten 7 Tage zeigen ${contextSummary.recentLoad7d.doneSessions} Einheiten bei ${contextSummary.recentLoad7d.totalKm} km. `
    : "";
  return `${loadHint}Heute steuern wir konservativ und priorisieren die naechste wichtige Einheit. Halte den Reiz sauber, statt kurzfristig zu ueberziehen.`;
}

function normalizeAiResponseForFrontend(payload, { userInput = "", context = {} } = {}) {
  const contextSummary = deriveCoachContext(context);
  const risk = detectRiskProfile(userInput, contextSummary);
  const mode = ["coach", "navigator", "support"].includes(payload?.mode)
    ? payload.mode
    : "coach";

  let message = sanitizeSentence(payload?.message);
  if (!message) {
    message = buildFallbackCoachMessage(userInput, risk, contextSummary);
  } else if (risk.pushDespiteRisk && !hasRiskCorrectionLanguage(message)) {
    message = `${message} Heute keine harte Einheit; wir priorisieren Erholung fuer den naechsten Qualitaetstag.`;
  }
  message = enforceCoachTone(message);

  const actionType = inferActionType(payload?.action?.type, risk);
  if (!actionType) {
    return { mode, message, action: null };
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
  const preview = normalizePreview(payload?.action?.preview, actionType, risk, contextSummary);

  return {
    mode,
    message,
    action: { type: actionType, payload: payloadData, preview },
  };
}

function fallbackStructuredResponse(
  message = "Ich konnte die Antwort nicht sauber strukturieren.",
  userInput = "",
  context = {}
) {
  return normalizeAiResponseForFrontend({ message }, { userInput, context });
}

function parseModelJson(response) {
  if (
    response &&
    typeof response === "object" &&
    response.output_parsed &&
    typeof response.output_parsed === "object"
  ) {
    return response.output_parsed;
  }
  const outputText = response?.output_text;
  if (typeof outputText === "string" && outputText.trim().startsWith("{")) {
    return JSON.parse(outputText);
  }
  const messageBlock = (response?.output || []).find((entry) => entry.type === "message");
  const jsonChunk = messageBlock?.content?.find(
    (item) => item.type === "output_json" && item.json && typeof item.json === "object"
  );
  if (jsonChunk?.json) return jsonChunk.json;
  const textChunk = messageBlock?.content?.find(
    (item) => item.type === "output_text" && typeof item.text === "string"
  );
  if (textChunk?.text) return JSON.parse(textChunk.text);
  throw new Error("No JSON output in model response");
}

// ─── System prompt & user payload ────────────────────────────────────────────

function buildSystemPrompt() {
  return [
    "You are an elite marathon coach guiding a sub-2:50 athlete.",
    "You do not give generic advice.",
    "You make decisions like a real coach based on context.",
    "Always evaluate:",
    "- current fatigue",
    "- injury signals",
    "- recent training load",
    "- upcoming key sessions",
    "- long-term goal (sub 2:50 marathon)",
    "Rules:",
    "- If injury signs (for example sharp knee pain) -> stop running or reduce load significantly",
    "- If fatigue is high -> reduce intensity and prioritize recovery",
    "- If user wants to push despite risk -> correct them clearly",
    "- Optimize for long-term performance, not short-term ego",
    "If the user is about to make a bad training decision, you must correct them clearly. Do not agree just to be polite.",
    "Style: direct, decisive, confident, short, like a strict performance coach.",
    "Do not use soft suggestions such as 'you could' or 'consider'.",
    "If a decision is suboptimal or risky, say no and give a firm instruction.",
    "Output intent: brief assessment, clear decision for today, short reason.",
    "Return only JSON matching the required schema.",
    "You may use only these actions:",
    ALLOWED_ACTIONS.join(", "),
    "Never execute changes directly; only propose structured actions.",
    "Be conservative if uncertain. Prefer support mode over wrong actions.",
    "For training changes, provide short, clear German messaging and practical preview items.",
  ].join("\n");
}

function buildUserPayload(input, context) {
  const coachContext = deriveCoachContext(context);
  return JSON.stringify({
    userInput: input,
    coachContext,
    rawContext: context,
    instructions: {
      language: "German",
      actionSafety: "suggest-only",
      structuredOutput: true,
      targetGoal: "sub-2:50 marathon",
      responseStyle: "direct_confident_short",
      outputIntent: ["brief assessment", "clear decision for today", "short reason"],
    },
  });
}

async function callResponsesApi({ selectedModel, input, context, allowedActions, responseSchemaVersion }) {
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
      allowedActions: Array.isArray(allowedActions)
        ? allowedActions.join(",")
        : ALLOWED_ACTIONS.join(","),
    },
  });
}

// ─── Daily coach helpers ─────────────────────────────────────────────────────

function buildDailyCoachSystemPrompt() {
  return [
    "You are an elite marathon coach for a sub-2:50 athlete.",
    "Given today's training context, provide a brief daily training recommendation.",
    "Respond ONLY with valid JSON — no markdown, no extra text — in this exact shape:",
    '{ "level": "hard" | "easy" | "rest" | "alternative", "title": "Heute: [2-4 word label]", "reason": "[one direct sentence in German, max 15 words]", "details": ["detail 1", "detail 2", "detail 3"] }',
    "Rules:",
    "- Respond in German.",
    "- Be direct. No soft phrases like 'vielleicht' or 'könntest du'.",
    "- 'hard': fresh recovery, quality session planned, weekly load low/medium.",
    "- 'rest': recovery red or rest day planned or illness/injury mentioned.",
    "- 'alternative': cross-training or injury-adjustment.",
    "- 'easy': everything else — moderate or recovery-focused.",
    "- Max 3 details, each max 8 words.",
    "- Title always starts with 'Heute: '.",
  ].join("\n");
}

function buildDailyCoachUserPrompt(coachContext) {
  return JSON.stringify({
    recoveryState: coachContext.recoveryLabel ?? "unbekannt",
    weeklyFatigue: coachContext.weeklyFatigueLabel ?? "unbekannt",
    recentHardSessionsOf5: coachContext.recentHardCount ?? 0,
    avgFeelingScore:
      coachContext.avgRecentFeeling > 0
        ? Number(coachContext.avgRecentFeeling).toFixed(1)
        : "keine Daten",
    todayPlannedSession: coachContext.todaySessionType ?? "keine",
    currentPhase: coachContext.phase ?? "unbekannt",
    daysToNextKeySession: coachContext.daysToNextKeySession ?? "unbekannt",
    completedSessions: coachContext.doneSessions ?? 0,
    athleteGoal: "Sub 2:50 marathon",
  });
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

// ─── Body parsing helper ─────────────────────────────────────────────────────

/**
 * Vercel's runtime usually provides req.body as a parsed object.
 * In some edge-cases (e.g. raw passthrough) it may arrive as a JSON string.
 * This helper ensures we always get a plain object.
 */
function ensureParsedBody(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw === "object") return raw;
  return {};
}

// ─── Exported request handlers ───────────────────────────────────────────────

/**
 * Handle POST /api/ai
 * @param {*} rawBody - req.body (parsed object or raw string)
 * @returns {{ status: number, body: object }}
 */
async function handleAiCoach(rawBody) {
  const body = ensureParsedBody(rawBody);
  console.log("[api/ai] incoming body keys:", Object.keys(body)); // eslint-disable-line no-console
  const {
    input,
    context,
    allowedActions,
    responseSchemaVersion,
    model: modelOverride,
  } = body;

  if (typeof input !== "string" || !input.trim()) {
    return { status: 400, body: { error: "Invalid input" } };
  }
  if (!context || typeof context !== "object") {
    return { status: 400, body: { error: "Invalid context" } };
  }

  // Layer 1: deterministic high-risk override — always before any AI call.
  const override = detectImmediateHighRiskOverride(input);
  if (override) {
    console.log("[api/ai] OVERRIDE TRIGGERED", input); // eslint-disable-line no-console
    return {
      status: 200,
      body: { mode: "coach", message: override.message, override: true },
    };
  }

  if (!client) {
    // No API key — return rule-based fallback without error noise.
    const fallback = fallbackStructuredResponse(undefined, input, context);
    return { status: 200, body: fallback };
  }

  try {
    const selectedModel =
      typeof modelOverride === "string" && modelOverride.trim() ? modelOverride : defaultModel;
    console.log(`[api/ai] model=${selectedModel}`); // eslint-disable-line no-console
    const completion = await callResponsesApi({
      selectedModel,
      input,
      context,
      allowedActions,
      responseSchemaVersion,
    });

    let normalized;
    try {
      const payload = parseModelJson(completion);
      normalized = normalizeAiResponseForFrontend(payload, { userInput: input, context });
    } catch {
      normalized = fallbackStructuredResponse(undefined, input, context);
    }
    if (!normalized || !isValidAiResponse(normalized)) {
      normalized = fallbackStructuredResponse(undefined, input, context);
    }
    return { status: 200, body: normalized };
  } catch (error) {
    console.error("[api/ai] OpenAI error", { // eslint-disable-line no-console
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    const fallback = fallbackStructuredResponse(
      "Ich konnte die Antwort nicht sauber strukturieren.",
      input,
      context
    );
    return { status: 200, body: fallback };
  }
}

/**
 * Handle POST /api/ai/daily-coach
 * @param {*} rawBody - req.body (parsed object or raw string)
 * @returns {{ status: number, body: object }}
 */
async function handleDailyCoach(rawBody) {
  const body = ensureParsedBody(rawBody);
  const { coachContext } = body;
  if (!coachContext || typeof coachContext !== "object") {
    return { status: 400, body: { error: "Invalid coachContext" } };
  }
  if (!client) {
    return { status: 200, body: { fallback: true, reason: "no_client" } };
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
          content: [{ type: "input_text", text: buildDailyCoachUserPrompt(coachContext) }],
        },
      ],
      text: { format: { type: "json_object" } },
    });
    const parsed = parseDailyCoachResponse(completion);
    if (!parsed) {
      return { status: 200, body: { fallback: true } };
    }
    console.log("[api/ai/daily-coach] response", parsed); // eslint-disable-line no-console
    return { status: 200, body: parsed };
  } catch (error) {
    console.error("[api/ai/daily-coach] error", { // eslint-disable-line no-console
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    return { status: 200, body: { fallback: true } };
  }
}

module.exports = { handleAiCoach, handleDailyCoach };
