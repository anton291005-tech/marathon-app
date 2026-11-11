/**
 * KI-Einwilligung (App-Store-Regel 5.1.2(i), Migration 015) — reiner Zustand, ohne React und ohne Netz.
 *
 * Quelle der Wahrheit ist `profiles.ai_consent_at` / `ai_consent_version` in Supabase; der Server prüft
 * dieselben Spalten (`api/_lib/aiConsent.js`). Die Datenbank kennt nur „zugestimmt“ oder nicht. Ob jemand
 * bewusst abgelehnt hat (dann fragen wir nicht bei jedem Start erneut), merkt sich das Gerät pro Nutzer.
 */

import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../../persistence/safeLocalStorage";
import { AI_CONSENT_DECLINED_KEY } from "../../persistence/marathonLocalStorageKeys";

/** Mindestversion des Einwilligungstexts; muss `AI_CONSENT_VERSION` in `api/_lib/aiConsent.js` entsprechen. */
export const AI_CONSENT_VERSION = 1;

/**
 * - `loading`: noch nicht gelesen
 * - `granted`: zugestimmt (aktuelle Version)
 * - `declined`: auf diesem Gerät bewusst abgelehnt oder widerrufen
 * - `undecided`: noch nie gefragt (oder Text-Version veraltet) → Zustimmungs-Screen zeigen
 * - `unavailable`: konnte nicht gelesen werden (offline, Fehler) → Coach aus, aber nicht nachfragen
 */
export type AiConsentStatus = "loading" | "granted" | "declined" | "undecided" | "unavailable";

export type AiConsentRow = { ai_consent_at: string | null; ai_consent_version: number | null } | null;

export function isConsentRowGranted(row: AiConsentRow): boolean {
  return (
    !!row &&
    typeof row.ai_consent_at === "string" &&
    row.ai_consent_at.length > 0 &&
    typeof row.ai_consent_version === "number" &&
    row.ai_consent_version >= AI_CONSENT_VERSION
  );
}

export function statusFromConsentRow(row: AiConsentRow, declinedOnDevice: boolean): AiConsentStatus {
  if (isConsentRowGranted(row)) return "granted";
  return declinedOnDevice ? "declined" : "undecided";
}

type DeclinedMap = Record<string, number>;

/** Hat dieser Nutzer auf diesem Gerät abgelehnt (für die aktuelle Textversion)? */
export function readDeclinedOnDevice(userId: string): boolean {
  const map = safeReadLocalStorageJson<DeclinedMap>(AI_CONSENT_DECLINED_KEY, {});
  return typeof map?.[userId] === "number" && map[userId] >= AI_CONSENT_VERSION;
}

export function writeDeclinedOnDevice(userId: string, declined: boolean): void {
  const map = { ...safeReadLocalStorageJson<DeclinedMap>(AI_CONSENT_DECLINED_KEY, {}) };
  if (declined) map[userId] = AI_CONSENT_VERSION;
  else delete map[userId];
  safeWriteLocalStorageJson(AI_CONSENT_DECLINED_KEY, map);
}
