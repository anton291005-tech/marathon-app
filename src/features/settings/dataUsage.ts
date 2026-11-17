import { APPLE_HEALTH_READ_TYPES } from "../../appleHealth/appleHealthService";

type AppleHealthReadType = (typeof APPLE_HEALTH_READ_TYPES)[number];

/**
 * Anzeigename je HealthKit-Typ. Der Record ist an `APPLE_HEALTH_READ_TYPES` gebunden — dieselbe Liste,
 * mit der die App den Zugriff anfragt (`Health.requestAuthorization`): kommt dort ein Typ dazu,
 * bricht der Build, bis er hier einen Namen hat.
 */
export const APPLE_HEALTH_TYPE_LABELS: Record<AppleHealthReadType, string> = {
  workouts: "Trainings (Art, Zeitpunkt, Dauer)",
  distance: "Lauf- und Gehstrecke",
  distanceCycling: "Radstrecke",
  heartRate: "Herzfrequenz",
  calories: "Verbrannte Kalorien (Aktivenergie)",
  sleep: "Schlaf",
  heartRateVariability: "Herzfrequenzvariabilität (HRV)",
  restingHeartRate: "Ruhepuls",
  respiratoryRate: "Atemfrequenz",
  bodyTemperature: "Körpertemperatur",
  basalBodyTemperature: "Basaltemperatur",
};

/** Die angefragten Apple-Health-Datentypen in der Reihenfolge des HealthKit-Scopes. */
export function listAppleHealthDataTypes(): string[] {
  return APPLE_HEALTH_READ_TYPES.map((type) => APPLE_HEALTH_TYPE_LABELS[type]);
}

export type AiDataUse = { title: string; provider: string; items: readonly string[]; note?: string };

/**
 * Was beim Coach an den KI-Anbieter geht — abgelesen aus dem Request-Payload:
 * `src/lib/ai/getAiContext.ts` `toRemoteCoachPayload` → `api/_lib/coachHandlers.js` `callClaudeApi`.
 * Dieselbe Liste zeigt der Zustimmungs-Screen (`features/aiConsent/AiConsentSheet.tsx`).
 */
export const AI_COACH_DATA_ITEMS: readonly string[] = [
  "Deine Nachricht und der Chatverlauf",
  "Dein Trainingsplan",
  "Deine Trainingseinträge der letzten Wochen (inkl. Notizen und Gefühl)",
  "Läufe und Radfahrten aus Apple Health der letzten Wochen (Art, Datum, Dauer, Distanz, Durchschnittspuls)",
  "Erholungswerte: Schlaf, HRV, Ruhepuls",
  "Zielzeit und Max-HF",
];

/**
 * Wofür Daten an einen KI-Anbieter gehen. Die Plan-Erstellung rechnet seit dem Plan-Kern (2026-11-07) ohne KI;
 * nur wenn der Kern scheitert und du dem KI-Coach zugestimmt hast, springt der frühere Claude-Generator ein
 * (`api/onboarding/generate-plan-full.ts`). Ohne Zustimmung geht nichts an Anthropic (Migration 015).
 */
/** Was bei der Plan-Erstellung im Ausnahmefall an Claude geht (`legacyPlanProfile`, nur mit KI-Einwilligung). */
export const AI_PLAN_FALLBACK_DATA_ITEMS: readonly string[] = [
  "Renndistanz, Ziel und Zielzeit",
  "Renndatum und Planstart",
  "Dein aktueller Wochenumfang",
  "Deine Wünsche aus dem Freitext",
];

/** Was der Morgen-Check-in speichert (`daily_checkins`, Migration 017) — nur mit Zustimmung zu Gesundheitsangaben. */
export const CHECKIN_DATA_ITEMS: readonly string[] = [
  "Schlafqualität, Energie, Beine und Kopf (je 1–5)",
  "„Etwas zwickt“: Körperstelle, Stärke und ob du anders läufst",
  "„Fühle mich krank“: angegebene Symptome",
];

export const AI_DATA_USES: readonly AiDataUse[] = [
  {
    title: "Coach",
    provider: "Anthropic (Claude)",
    items: AI_COACH_DATA_ITEMS,
    note: "Nur wenn du dem KI-Coach zugestimmt hast. Deine E-Mail-Adresse wird nicht mitgeschickt.",
  },
  {
    title: "Plan-Erstellung",
    provider: "Anthropic (Claude) — nur im Ausnahmefall",
    items: AI_PLAN_FALLBACK_DATA_ITEMS,
    note:
      "Dein Plan wird in MyRace selbst berechnet, ohne KI. Nur wenn das scheitert und du dem KI-Coach zugestimmt hast, hilft Claude aus. Keine Gesundheitsdaten.",
  },
];
