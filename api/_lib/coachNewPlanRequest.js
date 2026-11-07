"use strict";

/**
 * Feste Antwort auf „Erstelle mir einen Marathon-Plan“ (Entscheidung 2026-11-07): Pläne entstehen nur
 * im Wizard (Plan-Kern), der Chat erzeugt keinen. Greift in `handleAiCoach` vor Claude und unabhängig
 * vom Planzustand — auch nach abgeschlossener Vorbereitung, wo der Prompt sonst „bereit für eine neue
 * Vorbereitung“ meldet und Claude nach Zieldatum und Zielzeit fragt.
 *
 * Text identisch mit `NEW_PLAN_VIA_SETTINGS_MESSAGE` in src/lib/ai/coachDeterministicResponses.ts
 * (Test prüft das).
 */
const NEW_PLAN_VIA_SETTINGS_MESSAGE =
  "Einen neuen Trainingsplan erstellst du unter **Einstellungen → Training → Neuer Trainingsplan**. Dort fragt dich der Assistent nach Rennen, Lauftagen und deiner aktuellen Form und baut den Plan daraus. Hier im Chat erstelle ich keinen Plan, ich passe deinen bestehenden an.";

/** Verb, das einen Plan anfordert („erstelle“, „bau“, „ich brauche“, …). */
const CREATE_VERB =
  /\b(?:erstell\w*|generier\w*|bau(?:e|en|st|t)?|schreib(?:e|en|st|t)?|entwirf|entwerfen?|mach(?:e|en|st|t)?|brauch(?:e|en|st|t)?|moecht\w*|mocht\w*|will|wollte|ha(?:e|)tte gern)\b/;

/**
 * Ein NEUER Plan als Objekt: „einen (neuen) Marathon-Plan“, „einen Plan“, „neuen Trainingsplan“.
 * „meinen Plan“ zählt nicht — das ist eine Anpassung des bestehenden.
 */
const NEW_PLAN_OBJECT =
  /\b(?:ein(?:e|en)?|nen|neue[nrs]?)\s+(?:(?!(?:in|im|aus|zu|zum|den|dem|meinen?|meinem|deinen?)\b)[a-z0-9-]+\s+){0,2}[a-z0-9-]*plan\b/;

/** Kein Trainingsplan im Sinne des Wizards: Tages-/Wochenhorizont, Kraft, Ernährung, Taper, Erholung. */
const NOT_A_TRAINING_PLAN =
  /\b(?:heute|morgen|ubermorgen|uebermorgen|wochenende)\b|(?:diese|nachste|naechste)\s+woche|wochenplan|tagesplan|kraft|dehn|stretch|mobil|yoga|ernahr|ernaehr|essen|taper|erhol|regenerat/;

/** `normalizedText`: klein, ohne Diakritika, ohne Satzzeichen (wie `normalizeText` in coachHandlers). */
function isNewPlanRequest(normalizedText) {
  if (typeof normalizedText !== "string" || !normalizedText) return false;
  if (NOT_A_TRAINING_PLAN.test(normalizedText)) return false;
  return CREATE_VERB.test(normalizedText) && NEW_PLAN_OBJECT.test(normalizedText);
}

module.exports = { NEW_PLAN_VIA_SETTINGS_MESSAGE, isNewPlanRequest };
