"use strict";

const { parseOnboardingRaceDate } = require("./deterministicPlanGenerator");

/**
 * Harte Eingabelimits der kostenpflichtigen Endpunkte. Ein angemeldeter Nutzer darf den Preis eines
 * Requests nicht über die Eingabe bestimmen: Länge der Chat-Nachricht, Größe des Kontexts und die
 * Plandauer (jede weitere 6-Wochen-Scheibe ist ein weiterer Haiku-Aufruf) sind gedeckelt.
 */

/** Chat-Nachricht des Nutzers (Zeichen). */
const COACH_INPUT_MAX_CHARS = 2000;
/**
 * Roh-Kontext des Coach-Chats als JSON. Ein 20-Wochen-Plan liegt allein bei rund 40–80 KB, dazu kommen
 * Logs, Health-Läufe und Recovery-Reihen. Startwert mit Luft — die echte Größe steht je Request als
 * `contextBytes` im Log (`[api/ai] request`), daran lässt sich der Wert später enger ziehen.
 */
const COACH_CONTEXT_MAX_BYTES = 512 * 1024;
/** Der Client schickt die letzten 6 Chat-Zeilen; mehr als das Doppelte kommt nie legitim an. */
const COACH_MAX_TURNS = 12;
const COACH_TURN_MAX_CHARS = 4000;

const PLAN_BODY_MAX_BYTES = 20 * 1024;
const PLAN_TEXT_MAX_CHARS = 200;
/** Wie `MAX_PREFERENCE_FIELDS` im Onboarding. */
const PLAN_MAX_PREFERENCES = 10;
const PLAN_MAX_DURATION_DAYS = 52 * 7;
const PLAN_MAX_RACE_DISTANCE_KM = 1000;

function parseJsonBody(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}

function jsonByteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function reject(status, error) {
  return { ok: false, status, body: { error } };
}

/**
 * POST /api/ai: gibt nur `input` und `context` an den Handler weiter — ein `model` aus dem Body erreicht
 * ihn nie. Fehlende/ungültige Felder lehnt weiterhin `handleAiCoach` selbst ab (400).
 */
function validateCoachBody(rawBody) {
  const body = parseJsonBody(rawBody);
  const { input, context } = body;

  if (typeof input === "string" && input.length > COACH_INPUT_MAX_CHARS) {
    return reject(400, `Input too long (max ${COACH_INPUT_MAX_CHARS} characters)`);
  }
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return { ok: true, payload: { input, context } };
  }

  const contextBytes = jsonByteLength(context);
  if (contextBytes > COACH_CONTEXT_MAX_BYTES) {
    return reject(413, "Context too large");
  }

  let conversationTurns = context.conversationTurns;
  if (Array.isArray(conversationTurns)) {
    conversationTurns = conversationTurns.slice(-COACH_MAX_TURNS).map((turn) =>
      turn && typeof turn === "object" && typeof turn.text === "string" && turn.text.length > COACH_TURN_MAX_CHARS
        ? { ...turn, text: turn.text.slice(0, COACH_TURN_MAX_CHARS) }
        : turn,
    );
  }

  return {
    ok: true,
    payload: { input, context: { ...context, conversationTurns } },
    meta: { inputChars: typeof input === "string" ? input.length : 0, contextBytes },
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, PLAN_TEXT_MAX_CHARS) : "";
}

/**
 * Profil der Plan-Erzeugung: nur die Felder von `PlanGenerationProfile` (mehr liest der Server
 * nicht), Texte auf `PLAN_TEXT_MAX_CHARS` gekürzt, höchstens `PLAN_MAX_PREFERENCES` Wünsche.
 * Unbekannte Felder fallen weg. Zu lange Texte werden gekürzt statt abgelehnt, damit ein ausführlicher
 * Wunsch im Onboarding nicht die ganze Plan-Erzeugung kippt.
 *
 * @param {unknown} rawBody
 * @param {{ enforceMaxDuration?: boolean }} [options] `true` für den Vollplan: die Plandauer bestimmt dort die Zahl der KI-Aufrufe.
 */
function validatePlanBody(rawBody, options = {}) {
  const body = parseJsonBody(rawBody);
  const raw = body.profile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return reject(400, "profile required");
  }
  if (jsonByteLength(raw) > PLAN_BODY_MAX_BYTES) {
    return reject(413, "Profile too large");
  }

  const distance = Number(raw.raceDistanceKm);
  const duration = Number(raw.planDurationDays);
  const profile = {
    raceDistanceKm:
      raw.raceDistanceKm != null && Number.isFinite(distance) && distance > 0 && distance <= PLAN_MAX_RACE_DISTANCE_KM
        ? distance
        : null,
    raceDistanceLabel: cleanText(raw.raceDistanceLabel),
    raceGoal: cleanText(raw.raceGoal),
    raceTargetTime: typeof raw.raceTargetTime === "string" ? cleanText(raw.raceTargetTime) : null,
    weeklyKmRange: cleanText(raw.weeklyKmRange),
    raceDate: cleanText(raw.raceDate),
    planStartDate: cleanText(raw.planStartDate),
    planDurationDays: raw.planDurationDays != null && Number.isFinite(duration) ? Math.round(duration) : null,
    userPreferences: (Array.isArray(raw.userPreferences) ? raw.userPreferences : [])
      .map(cleanText)
      .filter(Boolean)
      .slice(0, PLAN_MAX_PREFERENCES),
  };

  if (options.enforceMaxDuration) {
    const start = parseOnboardingRaceDate(profile.planStartDate);
    const race = parseOnboardingRaceDate(profile.raceDate);
    const daysFromDates = start && race ? Math.abs(Math.round((race.getTime() - start.getTime()) / 86400000)) : null;
    const days = Math.max(daysFromDates ?? 0, profile.planDurationDays ?? 0);
    if (days > PLAN_MAX_DURATION_DAYS) {
      return reject(400, "Plan duration exceeds 52 weeks");
    }
  }

  return { ok: true, payload: { profile } };
}

module.exports = {
  validateCoachBody,
  validatePlanBody,
  parseJsonBody,
  COACH_INPUT_MAX_CHARS,
  COACH_CONTEXT_MAX_BYTES,
  COACH_MAX_TURNS,
  COACH_TURN_MAX_CHARS,
  PLAN_BODY_MAX_BYTES,
  PLAN_TEXT_MAX_CHARS,
  PLAN_MAX_PREFERENCES,
  PLAN_MAX_DURATION_DAYS,
};
