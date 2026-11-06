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
 * Plan-Eingaben für den Plan-Kern (Spec §2, Umbauplan Schritt 9). Wertebereiche wie `src/planCore/config.ts`
 * (`inputs.*`, `form.raceDistanceKm`). Ungültige Felder fallen einzeln weg statt den Request abzulehnen; ein alter
 * Client ohne die Felder bekommt genau das Profil wie bisher (kein Schlüssel kommt dazu).
 */
const PLAN_WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const PLAN_RUN_DAYS_MIN = 3;
const PLAN_RUN_DAYS_MAX = 6;
const PLAN_WEEKLY_KM_MAX = 150;
const PLAN_LONGEST_RUN_KM_MAX = 45;
const PLAN_RECENT_RACE_KM_MIN = 1.5;
const PLAN_RECENT_RACE_KM_MAX = 42.2;
/** Länger als 24 h ist für 1,5–42,2 km kein Rennergebnis. */
const PLAN_RECENT_RACE_MAX_SECONDS = 24 * 3600;

function finiteInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function cleanRecentRace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!finiteInRange(raw.distanceKm, PLAN_RECENT_RACE_KM_MIN, PLAN_RECENT_RACE_KM_MAX)) return null;
  if (!finiteInRange(raw.timeSeconds, 1, PLAN_RECENT_RACE_MAX_SECONDS)) return null;
  if (typeof raw.estimated !== "boolean") return null;
  if (raw.estimated) {
    return { distanceKm: raw.distanceKm, timeSeconds: Math.round(raw.timeSeconds), dateYmd: null, estimated: true };
  }
  if (typeof raw.dateYmd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateYmd)) return null;
  return { distanceKm: raw.distanceKm, timeSeconds: Math.round(raw.timeSeconds), dateYmd: raw.dateYmd, estimated: false };
}

const PLAN_INPUT_KEYS = [
  "runDaysPerWeek",
  "availableDays",
  "longRunDay",
  "currentWeeklyKm",
  "longestRecentRunKm",
  "longestRecentRunKmIsDefault",
  "recentRace",
];

/**
 * Profil für den heutigen Generator: ohne die Plan-Eingaben. Der Struktur-Aufruf schickt das Profil als JSON an
 * Claude; ohne diesen Schnitt würde sich der heutige Pfad durch die neuen Felder still ändern. Bis zum Umschalten
 * (Umbauplan Schritt 10/12) liest nur der Plan-Kern die Plan-Eingaben.
 */
function legacyPlanProfile(profile) {
  const out = { ...profile };
  PLAN_INPUT_KEYS.forEach((key) => delete out[key]);
  return out;
}

/** Nur gültige Plan-Eingaben; Tage in der Reihenfolge Mo–So, Long-Run-Tag nur, wenn er unter den verfügbaren Tagen ist. */
function cleanPlanInputs(raw) {
  const out = {};
  if (Number.isInteger(raw.runDaysPerWeek) && finiteInRange(raw.runDaysPerWeek, PLAN_RUN_DAYS_MIN, PLAN_RUN_DAYS_MAX)) {
    out.runDaysPerWeek = raw.runDaysPerWeek;
  }
  if (Array.isArray(raw.availableDays)) {
    const days = PLAN_WEEKDAYS.filter((day) => raw.availableDays.indexOf(day) >= 0);
    const enough = out.runDaysPerWeek === undefined ? days.length > 0 : days.length >= out.runDaysPerWeek;
    if (enough) out.availableDays = days;
  }
  if (out.availableDays && typeof raw.longRunDay === "string" && out.availableDays.indexOf(raw.longRunDay) >= 0) {
    out.longRunDay = raw.longRunDay;
  }
  if (finiteInRange(raw.currentWeeklyKm, 0, PLAN_WEEKLY_KM_MAX)) out.currentWeeklyKm = raw.currentWeeklyKm;
  if (finiteInRange(raw.longestRecentRunKm, 0, PLAN_LONGEST_RUN_KM_MAX)) {
    out.longestRecentRunKm = raw.longestRecentRunKm;
    if (typeof raw.longestRecentRunKmIsDefault === "boolean") {
      out.longestRecentRunKmIsDefault = raw.longestRecentRunKmIsDefault;
    }
  }
  if (raw.recentRace === null) out.recentRace = null;
  else {
    const race = cleanRecentRace(raw.recentRace);
    if (race) out.recentRace = race;
  }
  return out;
}

/**
 * Profil der Plan-Erzeugung: nur die Felder von `PlanGenerationProfile` (mehr liest der Server
 * nicht), Texte auf `PLAN_TEXT_MAX_CHARS` gekürzt, höchstens `PLAN_MAX_PREFERENCES` Wünsche, Plan-Eingaben
 * nur mit gültigen Werten (`cleanPlanInputs`).
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
    ...cleanPlanInputs(raw),
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
  legacyPlanProfile,
  PLAN_INPUT_KEYS,
  parseJsonBody,
  COACH_INPUT_MAX_CHARS,
  COACH_CONTEXT_MAX_BYTES,
  COACH_MAX_TURNS,
  COACH_TURN_MAX_CHARS,
  PLAN_BODY_MAX_BYTES,
  PLAN_TEXT_MAX_CHARS,
  PLAN_MAX_PREFERENCES,
  PLAN_MAX_DURATION_DAYS,
  PLAN_WEEKLY_KM_MAX,
  PLAN_LONGEST_RUN_KM_MAX,
};
