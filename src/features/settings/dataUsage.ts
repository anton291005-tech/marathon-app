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
  calories: "Verbrannte Kalorien",
  activeEnergyBurned: "Aktivenergie",
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
 * Was an den KI-Anbieter geht — abgelesen aus den Request-Payloads:
 * Plan: `api/_lib/claudePlanGenerator.js`, `api/_lib/phasedFullPlanGenerator.js` (Profil des Wizards);
 * Coach: `src/lib/ai/getAiContext.ts` `toRemoteCoachPayload` → `api/_lib/coachHandlers.js` `callClaudeApi`.
 * Beide Wege rufen Anthropic (Claude) auf; ein OpenAI-Endpunkt ist nicht mehr im Einsatz.
 * Reine Information — keine Einwilligungslogik (kommt mit `feat/ai-consent`).
 */
export const AI_DATA_USES: readonly AiDataUse[] = [
  {
    title: "Plan-Erstellung",
    provider: "Anthropic (Claude)",
    items: [
      "Renndistanz, Ziel und Zielzeit",
      "Renndatum und Planstart",
      "Dein aktueller Wochenumfang",
      "Deine Wünsche aus dem Freitext",
    ],
    note: "Keine Gesundheitsdaten.",
  },
  {
    title: "AI Coach",
    provider: "Anthropic (Claude)",
    items: [
      "Deine Nachricht und der Chatverlauf",
      "Dein Trainingsplan",
      "Deine Trainingseinträge der letzten Wochen (inkl. Notizen und Gefühl)",
      "Läufe und Radfahrten aus Apple Health der letzten Wochen (Art, Datum, Dauer, Distanz, Durchschnittspuls)",
      "Erholungswerte: Schlaf, HRV, Ruhepuls",
      "Zielzeit und Max-HF",
    ],
    note: "Deine E-Mail-Adresse wird nicht mitgeschickt.",
  },
];
