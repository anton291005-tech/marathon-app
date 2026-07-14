"use strict";

/**
 * Shared coaching logic for Vercel serverless functions.
 *
 * This module is a framework-free extract of server/index.js.
 * All handler functions receive a plain request body object and return
 * { status: number, body: object } — no Express or http dependencies.
 *
 * The Express dev server (server/index.js) imports handleAiCoach directly
 * from this file, so there is only one copy of the Claude coach logic.
 */

const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const { extractJson } = require("./extractJson");
// Deliberately use a local copy so this directory is fully self-contained.
// Do NOT change this back to "../../server/aiSchema" — that file is not always
// committed to git and would cause a MODULE_NOT_FOUND error on Vercel.
const {
  AI_RESPONSE_SCHEMA,
  ALLOWED_ACTIONS,
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
const anthropicApiKey = readEnvTrimmed("ANTHROPIC_API_KEY");
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

function includesAnyText(text, normalizedText, terms) {
  return terms.some(
    (term) => text.includes(term) || normalizedText.includes(normalizeText(term))
  );
}

// ─── Recovery domain only (no plan/logs/settings/planIntelligence fusion) ───

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

/** Band 0 = niedrig … 3 = frisch — aligned with `recoveryScoreBandOrdinal` (40 / 60 / 80). */
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

// ─── Risk detection ──────────────────────────────────────────────────────────

function detectRiskProfile(userInput, recoveryDomain) {
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
  const band = recoveryBandOrdinalFromDomain(recoveryDomain);
  const trainingLabel =
    recoveryDomain && typeof recoveryDomain.trainingRecoveryLabel === "string"
      ? recoveryDomain.trainingRecoveryLabel
      : "";
  const hasFatigueFromDomain =
    band === 0 || trainingLabel.includes("Niedrig") || trainingLabel.includes("Fatigue");
  const hasFatigue = hasFatigueByText || hasFatigueFromDomain;
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
        "Heute keine Intervalle. Du bist ermüdet und riskierst Überlastung. Mach stattdessen einen lockeren Lauf oder nimm einen Ruhetag.",
    };
  }
  if (hasInjury && mentionsRunning) {
    return {
      message:
        "Kein Laufen. Das Risiko für eine Verletzung ist zu hoch. Pause oder alternative Belastung.",
    };
  }
  if (hasIllness && mentionsTraining) {
    return {
      message:
        "Heute kein Training. Krankheit hat Priorität vor Leistung. Nimm Pause und starte erst nach klarer Symptomverbesserung wieder.",
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
    dayA: typeof rawPayload.dayA === "string" ? rawPayload.dayA : rawPayload.dayA ?? null,
    dayB: typeof rawPayload.dayB === "string" ? rawPayload.dayB : rawPayload.dayB ?? null,
    pct: parseNumeric(rawPayload.pct ?? rawPayload.boostPercent),
    weeks: parseNumeric(rawPayload.weeks ?? rawPayload.injuryWeeks),
    raceDateIsoOverride:
      typeof rawPayload.raceDateIsoOverride === "string" ? rawPayload.raceDateIsoOverride : rawPayload.raceDateIsoOverride ?? null,
    targetTime: typeof rawPayload.targetTime === "string" ? rawPayload.targetTime : rawPayload.targetTime ?? null,
    maxHeartRateBpm: parseNumeric(rawPayload.maxHeartRateBpm),
  });
}

/** Maps Claude-emitted action payloads onto shapes expected by the client executor. */
function normalizeClaudeActionPayload(actionType, rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return {};
  const p = { ...rawPayload };
  if (actionType === "adjust_plan_for_illness") {
    if (p.severityDays != null && !p.reason) {
      p.reason = "illness";
      p.severity = Number(p.severityDays) >= 3 ? "high" : "moderate";
    }
  }
  if (actionType === "replace_bike_with_run" && p.sessionId && !p.bikeSessionId) {
    p.bikeSessionId = p.sessionId;
  }
  if (actionType === "boost_next_week_volume" && p.boostPercent != null && p.pct == null) {
    p.pct = p.boostPercent;
  }
  if (actionType === "adapt_plan_injury_no_run" && p.injuryWeeks != null && p.weeks == null) {
    p.weeks = p.injuryWeeks;
    if (!p.reason) p.reason = "no_running_window";
  }
  if (actionType === "explain_feature" && p.featureKey && !p.topic) {
    p.topic = p.featureKey;
  }
  if (actionType === "update_user_preferences") {
    if (p.targetTime && !p.requestedStartDateLabel) {
      /* keep targetTime as-is */
    }
  }
  return p;
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
  const safeItems =
    items.length > 0 ? items : buildDefaultPreviewItems(actionType, risk, schedulingHint);
  return {
    title,
    items: safeItems.slice(0, 5),
    confirmLabel: sanitizeSentence(rawPreview?.confirmLabel) || "Ja, übernehmen",
    cancelLabel: sanitizeSentence(rawPreview?.cancelLabel) || "Nein",
    secondaryLabel:
      sanitizeSentence(rawPreview?.secondaryLabel) ||
      (actionType === "navigate_to_screen" ? null : "Anpassen"),
    openLabel:
      sanitizeSentence(rawPreview?.openLabel) ||
      (actionType === "navigate_to_screen" ? "Öffnen" : null),
  };
}

function inferActionType(rawAction, risk) {
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
  const mode = ["coach", "navigator", "support"].includes(payload?.mode)
    ? payload.mode
    : "coach";

  let message = sanitizeSentence(payload?.message);
  if (!message) {
    message = buildFallbackCoachMessage(userInput, risk, recoveryDomain);
  } else if (risk.pushDespiteRisk && !hasRiskCorrectionLanguage(message)) {
    message = `${message} Heute keine harte Einheit; wir priorisieren Erholung für den nächsten Qualitätstag.`;
  }
  message = enforceCoachTone(message);

  const actionType = inferActionType(payload?.action, risk);
  if (!actionType) {
    return { mode, message, action: null };
  }

  const payloadData = normalizePayload(
    normalizeClaudeActionPayload(actionType, payload?.action?.payload ?? payload?.payload),
  );
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

const SESSION_DATE_MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Dez: 11,
};

function parseSessionDateLabel(label, year) {
  if (typeof label !== "string" || !label.trim()) return null;
  const match = label.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = SESSION_DATE_MONTHS[match[2]];
  if (Number.isNaN(day) || month === undefined) return null;
  return new Date(year, month, day, 12, 0, 0, 0);
}

function normalizeCalendarDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function collectIncomingPlanWeeks(context) {
  const trainingPlan =
    context?.trainingPlan && typeof context.trainingPlan === "object" ? context.trainingPlan : null;
  return Array.isArray(trainingPlan?.weeks) ? trainingPlan.weeks : [];
}

function toCoachSessionObject(session) {
  return {
    date: session?.date ?? "",
    weekday: session?.day ?? "",
    title: session?.title ?? "",
    km: typeof session?.km === "number" ? session.km : 0,
    type: session?.type ?? "",
    pace: session?.pace ?? null,
  };
}

function findCurrentPlanWeek(weeks, today, year) {
  let bestWeek = null;
  let bestDistance = Infinity;
  for (const week of weeks) {
    for (const session of Array.isArray(week?.s) ? week.s : []) {
      const parsed = parseSessionDateLabel(session?.date, year);
      if (!parsed) continue;
      const diffMs = normalizeCalendarDay(parsed).getTime() - today.getTime();
      if (diffMs >= 0 && diffMs < bestDistance) {
        bestDistance = diffMs;
        bestWeek = week;
      }
    }
  }
  return bestWeek || weeks[0] || null;
}

function computeAvgWeeklyKmRemaining(weeks, today, year) {
  const remainingWeeks = weeks.filter((week) =>
    (Array.isArray(week?.s) ? week.s : []).some((session) => {
      const parsed = parseSessionDateLabel(session?.date, year);
      return parsed && normalizeCalendarDay(parsed).getTime() >= today.getTime();
    }),
  );
  if (!remainingWeeks.length) return null;
  const totalKm = remainingWeeks.reduce(
    (sum, week) => sum + (typeof week?.km === "number" ? week.km : 0),
    0,
  );
  return Math.round((totalKm / remainingWeeks.length) * 10) / 10;
}

function buildTrimmedTrainingPlan(context) {
  const weeks = collectIncomingPlanWeeks(context);
  const todayIso = typeof context?.todayIso === "string" ? context.todayIso : "";
  const now = todayIso ? new Date(todayIso) : new Date();
  const today = normalizeCalendarDay(Number.isFinite(now.getTime()) ? now : new Date());
  const year = today.getFullYear();
  const goals = context?.goals && typeof context.goals === "object" ? context.goals : {};
  const currentWeek = findCurrentPlanWeek(weeks, today, year);

  const datedSessions = weeks.flatMap((week) =>
    (Array.isArray(week?.s) ? week.s : []).map((session) => {
      const parsed = parseSessionDateLabel(session?.date, year);
      return {
        session,
        parsed,
        diffDays:
          parsed == null
            ? null
            : (normalizeCalendarDay(parsed).getTime() - today.getTime()) / 86400000,
      };
    }),
  );

  const next14Days = datedSessions
    .filter((entry) => entry.diffDays != null && entry.diffDays >= 0 && entry.diffDays <= 14)
    .sort((a, b) => a.diffDays - b.diffDays || String(a.session.id).localeCompare(String(b.session.id)))
    .map((entry) => toCoachSessionObject(entry.session));

  const last7Days = datedSessions
    .filter((entry) => entry.diffDays != null && entry.diffDays >= -7 && entry.diffDays < 0)
    .sort((a, b) => a.diffDays - b.diffDays || String(a.session.id).localeCompare(String(b.session.id)))
    .map((entry) => toCoachSessionObject(entry.session));

  return {
    next14Days,
    last7Days,
    planSummary: {
      totalWeeks: weeks.length,
      currentPhase: currentWeek?.phase || currentWeek?.label || "unknown",
      raceDateIso:
        context?.raceDateIso === null || typeof context?.raceDateIso === "string"
          ? context.raceDateIso
          : null,
      targetTime: goals.targetTime || "nicht gesetzt",
      avgWeeklyKmRemaining: computeAvgWeeklyKmRemaining(weeks, today, year),
    },
  };
}

function normalizeIncomingLogs(context) {
  const v = context?.logsLast30Days ?? context?.logsLast10Days;
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    return Object.entries(v).map(([sessionId, logEntry]) =>
      logEntry && typeof logEntry === "object" && !Array.isArray(logEntry)
        ? { sessionId, ...logEntry }
        : { sessionId: String(sessionId), logEntry },
    );
  }
  return [];
}

function trimLogsLast10Days(context) {
  return normalizeIncomingLogs(context).slice(-10);
}

function trimHealthRunsLast10Days(context) {
  const runs = Array.isArray(context?.healthRunsLast30Days)
    ? context.healthRunsLast30Days
    : Array.isArray(context?.healthRunsLast10Days)
      ? context.healthRunsLast10Days
      : [];
  return [...runs]
    .sort((a, b) => new Date(a?.startDate).getTime() - new Date(b?.startDate).getTime())
    .slice(-10);
}

function buildStaticCoachSystemPrompt() {
  return [
    "Antworte in maximal 3-4 Sätzen. Kein Fließtext, keine Aufzählungen.",
    "Du bist ein persönlicher Marathontrainer in der MyRace App.",
    "",
    "Du antwortest IMMER auf Deutsch, kurz und direkt — wie ein echter Trainer, nicht wie ein Chatbot.",
    "Du hast Zugriff auf ein Trainingsplan-Fenster (nächste 14 / letzte 7 Tage), Logs, Gesundheitsdaten und Recovery-Status des Users.",
    "",
    "DEINE AUFGABEN:",
    "- Fragen zum Training beantworten (Pace, Volumen, Taper, Verletzung, Ernährung, etc.)",
    "- Trainingseinheiten anpassen, verschieben, ersetzen",
    "- Auch bei Tippfehlern und unklaren Anfragen sinnvoll antworten",
    "- Motivation geben wenn der User es braucht",
    "",
    "ACTIONS: Wenn eine Planänderung sinnvoll ist, antworte NUR mit dem JSON-Block — kein Text davor/danach:",
    '{ "mode": "coach", "message": "Deine Erklärung auf Deutsch", "action": { "type": "<action_type>", "payload": { ... }, "preview": { "title": "Vorschau-Titel", "items": ["Änderung 1"], "confirmLabel": "Übernehmen", "cancelLabel": "Abbrechen" } } }',
    "",
    "Verfügbare action types:",
    "- adjust_plan_for_illness: payload { severityDays: number }",
    "- replace_bike_with_run: payload { sessionId: string }",
    "- convert_workout_to_run: payload { sessionId, targetSessionType, targetKm, targetPace, targetTitle, targetDesc }",
    "- shift_race_date: payload { shiftDays: number }",
    "- shift_plan_start_date: payload { requestedStartOffsetDays: number }",
    "- navigate_to_screen: payload { targetScreen, targetScreenLabel, section?, sectionLabel? }",
    "- explain_feature: payload { featureKey: string }",
    "- taper_before_race: payload { raceDateIsoOverride?: string }",
    "- boost_next_week_volume: payload { boostPercent: number }",
    "- adapt_plan_injury_no_run: payload { injuryWeeks: number }",
    "- update_user_preferences: payload { targetTime?: string, maxHeartRateBpm?: number }",
    "- swap_training_days: payload { dayA: string, dayB: string } (ISO-Datum YYYY-MM-DD)",
    "",
    "Wenn KEINE Action nötig ist: antworte mit reinem deutschen Text, KEIN JSON.",
    "Wenn eine Action nötig ist: antworte NUR mit dem JSON-Block, kein Text davor/danach.",
    "Wenn du eine Action vorschlägst, erkläre kurz warum in message.",
    "Sei direkt, kein Smalltalk, kein Auffüllen.",
    "Nutze recoveryDomain + recoverySummary für Sicherheit; widersprich niedrigem Recovery nicht.",
  ].join("\n");
}

function buildDynamicCoachSystemPrompt(context) {
  const contextBlock = buildContextSummary(context || {});
  return [
    "KONTEXT DES USERS:",
    contextBlock,
    "",
    "Strukturierte Rohdaten (JSON) folgen in den User-Nachrichten.",
  ].join("\n");
}

function buildContextSummary(context) {
  const lines = [];
  const goals = context?.goals && typeof context.goals === "object" ? context.goals : {};
  const targetTime = goals.targetTime || "nicht gesetzt";
  const raceDateIso = context?.raceDateIso || "unbekannt";
  lines.push(`Rennziel: ${targetTime}, Renn-Datum: ${raceDateIso}`);

  const trimmedPlan = buildTrimmedTrainingPlan(context);
  const summary = trimmedPlan.planSummary;
  if (summary.totalWeeks > 0) {
    lines.push(
      `Trainingsplan: ${summary.totalWeeks} Wochen gesamt, aktuelle Phase: ${summary.currentPhase}, Ø ${summary.avgWeeklyKmRemaining ?? "?"} km/Woche restlich`,
    );
    const next =
      trimmedPlan.next14Days.find((s) => s && s.type !== "rest") ||
      trimmedPlan.next14Days[0];
    if (next) {
      lines.push(
        `Nächste/heutige Einheit: ${next.weekday || ""} ${next.date || ""} — ${next.title || next.type} (${next.km ?? "?"} km)`,
      );
    }
  } else {
    lines.push("Trainingsplan: keine Wochen im Kontext");
  }

  const domain = pickRecoveryDomain(context);
  const recoverySummary = context?.recoverySummary;
  const score =
    typeof domain?.homeRecoveryScore0_100 === "number"
      ? domain.homeRecoveryScore0_100
      : typeof recoverySummary?.avgRecovery === "number"
        ? recoverySummary.avgRecovery
        : null;
  const label =
    domain && typeof domain.trainingRecoveryLabel === "string"
      ? domain.trainingRecoveryLabel
      : "Recovery";
  lines.push(
    score != null
      ? `Recovery: ${label} — Score ${Math.round(score)}/100.`
      : `Recovery: ${label}.`,
  );

  const logs = trimLogsLast10Days(context);
  const done = logs
    .filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.done === true) return true;
      if (entry.log && typeof entry.log === "object" && entry.log.done === true) return true;
      return false;
    })
    .slice(-3);
  if (done.length) {
    lines.push(
      `Letzte erledigte Workouts: ${done.map((e) => e.sessionId || "?").join(", ")}`,
    );
  } else {
    lines.push("Letzte erledigte Workouts: keine in den letzten 10 Tagen geloggt.");
  }

  return lines.join("\n");
}

function buildSystemPrompt(context) {
  return [buildStaticCoachSystemPrompt(), "", buildDynamicCoachSystemPrompt(context)].join("\n");
}

function buildMessagesArray(input, context) {
  const turns = Array.isArray(context?.conversationTurns) ? context.conversationTurns : [];
  const messages = turns
    .filter(
      (t) =>
        t &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.text === "string" &&
        t.text.trim(),
    )
    .map((t) => ({ role: t.role, content: t.text.trim() }));

  const inputTrim = typeof input === "string" ? input.trim() : "";
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content === inputTrim) {
    return messages.length ? messages : inputTrim ? [{ role: "user", content: inputTrim }] : [];
  }
  if (inputTrim) {
    messages.push({ role: "user", content: inputTrim });
  }
  return messages.length ? messages : inputTrim ? [{ role: "user", content: inputTrim }] : [];
}

/**
 * Wraps the global fetch so every HTTP attempt the SDK makes — including its
 * internal retries on 429/5xx/connection errors — is logged. Uses
 * process.stdout.write instead of console.log: console.log can be buffered
 * and lost if Vercel kills the function before the log is flushed.
 */
function loggingFetch(url, init) {
  return fetch(url, init).then(
    (response) => {
      if (!response.ok) {
        process.stdout.write(
          `[api/ai] Anthropic attempt failed: HTTP ${response.status}\n`
        );
      }
      return response;
    },
    (err) => {
      process.stdout.write(
        `[api/ai] Anthropic attempt failed: network error (${err?.message || err})\n`
      );
      throw err;
    }
  );
}

async function callClaudeApi({ input, context, apiKey }) {
  const contextJson = buildUserPayload(input, context);
  const messages = buildMessagesArray(input, context);
  if (messages.length === 0) {
    messages.push({ role: "user", content: typeof input === "string" ? input.trim() : "" });
  }
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === "user" && lastMsg.content !== contextJson) {
    lastMsg.content = `${lastMsg.content}\n\n[KONTEXT-DATEN]\n${contextJson}`;
  }

  // maxRetries: 2 → 3 attempts total. The SDK retries 429/5xx (incl. 529
  // Overloaded) and connection errors with exponential backoff, and throws
  // immediately on other 4xx (400/401/403/...) — no retry, as before.
  const anthropic = new Anthropic({ apiKey, maxRetries: 2, fetch: loggingFetch });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: buildStaticCoachSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: buildDynamicCoachSystemPrompt(context),
      },
    ],
    messages,
  });

  return response.content?.[0]?.text ?? "";
}

function parseClaudeCoachResponse(text, userInput, context) {
  const rawText = typeof text === "string" ? text : "";

  let normalized;
  try {
    const jsonStr = extractJson(rawText);
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string" && parsed.message.trim()) {
      if (parsed.action && typeof parsed.action === "object" && parsed.action.type) {
        parsed.action.payload = normalizeClaudeActionPayload(parsed.action.type, parsed.action.payload);
      }
      normalized = {
        mode: parsed.mode || "coach",
        message: parsed.message,
        action: parsed.action || null,
      };
    } else {
      normalized = {
        mode: "coach",
        message: rawText.trim(),
        action: null,
      };
    }
  } catch {
    normalized = {
      mode: "coach",
      message: rawText.trim(),
      action: null,
    };
  }

  if (!normalized.message || normalized.message.trim().length === 0) {
    normalized.message = "Ich bin gleich für dich da. Stell mir deine Frage.";
  }

  return normalizeAiResponseForFrontend(normalized, { userInput, context });
}

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
  const trainingPlan = buildTrimmedTrainingPlan(context);
  const logsLast10Days = trimLogsLast10Days(context);
  const healthRunsLast10Days = trimHealthRunsLast10Days(context);
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
    logsLast10Days,
    healthRunsLast10Days,
    instructions: {
      language: "German",
      actionSafety: "suggest-only-never-auto-apply",
      structuredOutput: true,
      recoverySsot:
        "Use recoveryDomain + recoverySummary for readiness; use trainingPlan (next14Days/last7Days/planSummary) + logsLast10Days + healthRunsLast10Days for schedule/volume adherence questions.",
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
  if (!pickRecoveryDomain(context)) {
    return { status: 400, body: { error: "Invalid context: recoveryDomain required" } };
  }

  // Layer 1: deterministic high-risk override — always before any AI call.
  const bareUser = extractBareUserTurn(input);
  const override = detectImmediateHighRiskOverride(bareUser);
  if (override) {
    console.log("[api/ai] OVERRIDE TRIGGERED", bareUser); // eslint-disable-line no-console
    return {
      status: 200,
      body: { mode: "coach", message: override.message, override: true },
    };
  }

  if (!anthropicApiKey) {
    const fallback = fallbackStructuredResponse(undefined, bareUser, context);
    return { status: 200, body: fallback };
  }

  try {
    console.log("[api/ai] model=claude-sonnet-4-6"); // eslint-disable-line no-console
    const rawText = await callClaudeApi({ input: bareUser, context, apiKey: anthropicApiKey });
    console.log("[api/ai] Claude response (first 200 chars):", rawText.slice(0, 200)); // eslint-disable-line no-console

    const normalized = parseClaudeCoachResponse(rawText, bareUser, context);
    return { status: 200, body: normalized };
  } catch (error) {
    console.error("[api/ai] Claude error", { // eslint-disable-line no-console
      message: typeof error?.message === "string" ? error.message : "unknown",
    });
    const fallback = fallbackStructuredResponse(
      "Ich konnte die Antwort nicht sauber strukturieren.",
      bareUser,
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
  const recoveryDomain = body.recoveryDomain ?? body.coachContext?.recoveryDomain;
  if (!recoveryDomain || typeof recoveryDomain !== "object") {
    return { status: 400, body: { error: "Invalid recoveryDomain" } };
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
          content: [{ type: "input_text", text: buildDailyCoachUserPrompt(recoveryDomain) }],
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
