"use strict";

/**
 * Feste Antwort auf „Erstelle mir einen Marathon-Plan“ (Entscheidung 2026-11-07): Pläne entstehen nur
 * im Wizard (Plan-Kern), der Chat erzeugt keinen. Greift in `handleAiCoach` vor Claude und unabhängig
 * vom Planzustand — auch nach abgeschlossener Vorbereitung, wo der Prompt sonst „bereit für eine neue
 * Vorbereitung“ meldet und Claude nach Zieldatum und Zielzeit fragt.
 *
 * Einzige Erkennung „neuen Plan anfordern“ im Code (die Client-Variante in coachDeterministicResponses.ts
 * war im Live-Chat nie erreichbar und ist gelöscht). Die „5“ im Text = `MAX_ACTIVE_PLANS` in
 * src/lib/supabase/services/trainingPlanService.ts (Test prüft das).
 */
const NEW_PLAN_VIA_SETTINGS_MESSAGE =
  "Einen neuen Trainingsplan erstellst du unter **Einstellungen → Training → Neuer Trainingsplan**. Dort fragt dich der Assistent nach Rennen, Lauftagen und deiner aktuellen Form und baut den Plan daraus. Du kannst bis zu 5 Pläne haben: Sind alle belegt, ist der Button gesperrt, lösche dann unter „Meine Trainingspläne“ zuerst einen. Hier im Chat erstelle ich keinen Plan, ich passe deinen bestehenden an.";

/** Verb, das einen Plan anfordert („erstelle“, „bau“, „ich brauche“, …). */
const CREATE_VERB =
  /\b(?:erstell\w*|generier\w*|bau(?:e|en|st|t)?|schreib(?:e|en|st|t)?|entwirf|entwerfen?|mach(?:e|en|st|t)?|brauch(?:e|en|st|t)?|moecht\w*|mocht\w*|will|wollte|brauchte|gib|gebt?|ha(?:e|)tte gern)\b/;

/**
 * Ausschluss für alles, was erkennbar kein neuer Trainingsplan ist (geht weiter an Claude), für BEIDE Zweige
 * unten: Fragen („ob“, „besser“); Tages-/Kurzfristhorizont („für heute“, „für Montag“, „Montag bis Freitag“,
 * „nächste Woche“, „nächsten 3 Tage“, „Rest der Woche“; „ab heute“ ist dagegen ein Planstart); Taper und
 * Erholung als Zeitanker („letzte Wochen“, „vor/nach dem Marathon“) oder Wort; Plan B, Reha, Urlaub, Kraft,
 * Ernährung. Bewusst konservativ: im Zweifel Claude (altes Verhalten).
 */
const WEEKDAY = "(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)";
const NOT_A_TRAINING_PLAN = new RegExp(
  [
    "\\bfur\\s+(?:heute|morgen|ubermorgen|uebermorgen|das\\s+wochenende)\\b",
    `\\b(?:fur|bis|von)\\s+(?:den\\s+)?${WEEKDAY}\\b`,
    `\\b${WEEKDAY}\\s+bis\\b`,
    "(?:diese|nachste|naechste|kommende)n?\\s+woche",
    "(?:die\\s+)?(?:nachsten|naechsten|kommenden)\\s+\\w+\\s+tage",
    "\\brest\\s+der\\s+woche\\b",
    "\\bletzte[nr]?\\s+(?:\\w+\\s+)?wochen?\\b",
    "\\b(?:vor|nach)\\s+dem\\s+(?:\\w*marathon|rennen|wettkampf)\\b",
    "\\bwoche\\s+(?:vor|nach)\\b",
    "wochenplan|tagesplan|\\bplan\\s+b\\b",
    "\\b(?:wissen|ob|warum|wieso|weshalb|besser|sinnvoll)\\b",
    "reha|urlaub|kraft|dehn|stretch|mobil|yoga|ernahr|ernaehr|essen|taper|erhol|regenerat",
  ].join("|"),
);

/**
 * Plan mit Trainings-/Rennbezug im Wort: „einen (neuen) Marathon-Plan“, „Halbmarathonplan“, „Trainingsplan“,
 * „10k-Plan“. Ohne Artikel („meinen Plan“) zählt es nicht, das ist eine Anpassung des bestehenden.
 */
const TYPED_PLAN =
  /\b(?:ein(?:e|en)?|nen|neue[nrs]?)\s+(?:neue[nrs]?\s+)?(?:[a-z0-9]+[- ])?[a-z0-9]*(?:marathon|trainings?|laufs?|\d+\s?k|\d+\s?km)[- ]?plan\b/;

/** „einen (neuen) Plan“ ohne Zusatzwort; nur mit Rennbezug oder als „neuer Plan“ ohne Horizont. */
const BARE_PLAN = /\b(?:ein(?:e|en)?|nen|neue[nrs]?)\s+(?:neue[nrs]?\s+)?plan\b/;
const NEW_BARE_PLAN = /\bneue[nrs]?\s+plan\b/;
const RACE_WORD = /\b(?:\w*marathon\w*|10\s?k|5\s?k|10\s?km|5\s?km|rennen|wettkampf|wettlauf)\b/;
const HORIZON = /\bfur\b|\d|\b(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|rest der woche|tage|wochen)\b/;

/** `normalizedText`: klein, ohne Diakritika, ohne Satzzeichen (wie `normalizeText` in coachHandlers). */
function isNewPlanRequest(normalizedText) {
  if (typeof normalizedText !== "string" || !normalizedText) return false;
  if (NOT_A_TRAINING_PLAN.test(normalizedText)) return false;
  if (!CREATE_VERB.test(normalizedText)) return false;
  if (TYPED_PLAN.test(normalizedText)) return true;
  if (!BARE_PLAN.test(normalizedText)) return false;
  if (RACE_WORD.test(normalizedText)) return true;
  return NEW_BARE_PLAN.test(normalizedText) && !HORIZON.test(normalizedText);
}

module.exports = { NEW_PLAN_VIA_SETTINGS_MESSAGE, isNewPlanRequest };
