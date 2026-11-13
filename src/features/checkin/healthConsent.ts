/**
 * Gesundheits-Zustimmung (Spec §15, Migration 017; v2 mit serverseitigem Zeitstempel, Migration 022).
 * Getrennt von der KI-Einwilligung: Diese Zustimmung erlaubt Lesen, Verarbeiten und Speichern im eigenen Konto,
 * nicht die Weitergabe an einen KI-Anbieter.
 *
 * Wortlaut-Archiv: Jede je gezeigte Textversion bleibt unverändert in `HEALTH_CONSENT_TEXTS` stehen (Nachweis nach
 * Art. 7 Abs. 1 DSGVO: Version in `profiles.health_consent_version` → Wortlaut hier). Neue Fassung = neuer Schlüssel,
 * `HEALTH_CONSENT_VERSION` anheben; alte Einträge nie ändern oder löschen (Test pinnt sie).
 */

import { getAppNow } from "../../core/time/timeSystem";
import { setHealthConsentStatus, settleHealthConsentDecision, type HealthConsentStatus } from "../../health/healthConsentStore";
import { supabase } from "../../lib/supabase/client";
import { HEALTH_CONSENT_DECLINED_KEY } from "../../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../../persistence/safeLocalStorage";

export const HEALTH_CONSENT_TEXTS = {
  /** 2026-11-12, Readiness Schritt 3 (nur Check-in). */
  "1":
    "MyRace speichert deine Antworten in deinem Konto, um deine Tagesform zu berechnen. Sie werden nicht für Werbung genutzt und nicht verkauft. An den KI-Coach gehen sie nur, wenn du dem gesondert zugestimmt hast.",
  /** 2026-11-13, Gesundheits-Zustimmung v2 (Check-in, Anstrengung, Apple-Health-Erholungswerte). */
  "2":
    "MyRace speichert und verarbeitet Gesundheitsdaten in deinem Konto (Supabase, EU), um deine Tagesform und Erholung einzuschätzen:\n" +
    "• deine Check-in-Antworten (Schlafqualität, Energie, Beine, Kopf, Beschwerden, Krankheitszeichen)\n" +
    "• die Anstrengung deiner Trainings, von dir eingegeben oder von deiner Uhr gemessen\n" +
    "• aus Apple Health, wenn du es verbindest: Schlaf, Herzfrequenzvariabilität (HRV), Ruhepuls, Atemfrequenz, Körper-, Basal- und Handgelenktemperatur, Blutsauerstoff, Pulserholung und VO2max. MyRace liest und verarbeitet diese Werte nur und schreibt nichts in Apple Health.\n" +
    "Nichts davon dient der Werbung oder wird verkauft. An den KI-Coach gehen Werte nur, wenn du dem KI-Coach gesondert zugestimmt hast. " +
    "Deine Trainings (Art, Zeit, Dauer, Strecke, Puls, Kalorien) liest MyRace für Plan und Auswertung auch ohne diese Zustimmung.\n" +
    "Du kannst jederzeit unter Einstellungen → Datenschutz & Daten widerrufen. Dann löscht MyRace deine Check-ins, Erholungswerte und Anstrengungen aus deinem Konto.",
} as const;

export type HealthConsentVersion = keyof typeof HEALTH_CONSENT_TEXTS;

/** Aktuelle Version; bei wesentlicher Änderung erhöhen (dann wird erneut gefragt). */
export const HEALTH_CONSENT_VERSION: HealthConsentVersion = "2";

export const HEALTH_CONSENT_TEXT: string = HEALTH_CONSENT_TEXTS[HEALTH_CONSENT_VERSION];

export type HealthConsentRow = { health_consent_at: string | null; health_consent_version: string | null } | null;

export function isHealthConsentGranted(row: HealthConsentRow): boolean {
  return !!row && typeof row.health_consent_at === "string" && row.health_consent_version === HEALTH_CONSENT_VERSION;
}

type DeclinedMap = Record<string, string>;

/** Hat dieser Nutzer auf diesem Gerät für die aktuelle Version abgelehnt oder widerrufen? */
export function readHealthConsentDeclinedOnDevice(userId: string): boolean {
  const map = safeReadLocalStorageJson<DeclinedMap>(HEALTH_CONSENT_DECLINED_KEY, {});
  return map?.[userId] === HEALTH_CONSENT_VERSION;
}

export function writeHealthConsentDeclinedOnDevice(userId: string, declined: boolean): void {
  const map = { ...safeReadLocalStorageJson<DeclinedMap>(HEALTH_CONSENT_DECLINED_KEY, {}) };
  if (declined) map[userId] = HEALTH_CONSENT_VERSION;
  else delete map[userId];
  safeWriteLocalStorageJson(HEALTH_CONSENT_DECLINED_KEY, map);
}

export function statusFromHealthConsent(
  result: { ok: true; granted: boolean } | { ok: false },
  declinedOnDevice: boolean,
): HealthConsentStatus {
  if (!result.ok) return "unavailable";
  if (result.granted) return "granted";
  return declinedOnDevice ? "declined" : "undecided";
}

export async function loadHealthConsent(userId: string): Promise<{ ok: true; granted: boolean } | { ok: false }> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("health_consent_at, health_consent_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, granted: isHealthConsentGranted((data as HealthConsentRow) ?? null) };
  } catch {
    return { ok: false };
  }
}

/**
 * Zustimmung setzen/zurücksetzen. Der Zeitstempel ist nur ein Platzhalter für den Check-Constraint (Migration 017):
 * Ab Migration 022 überschreibt ein Trigger `health_consent_at` mit `now()` der Datenbank.
 */
export async function saveHealthConsent(userId: string, granted: boolean): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        health_consent_at: granted ? getAppNow().toISOString() : null,
        health_consent_version: granted ? HEALTH_CONSENT_VERSION : null,
      },
      { onConflict: "user_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/** Übernimmt ein Ladeergebnis in den App-Zustand (berücksichtigt die auf dem Gerät gemerkte Ablehnung). */
export function applyLoadedHealthConsent(
  userId: string,
  result: { ok: true; granted: boolean } | { ok: false },
): HealthConsentStatus {
  const status = statusFromHealthConsent(result, readHealthConsentDeclinedOnDevice(userId));
  setHealthConsentStatus(userId, status);
  return status;
}

/** Nach erfolgreichem Speichern der Zustimmung: Status setzen, wartende Abfrage mit `true` beenden. */
export function markHealthConsentGranted(userId: string): void {
  writeHealthConsentDeclinedOnDevice(userId, false);
  setHealthConsentStatus(userId, "granted");
  settleHealthConsentDecision(true);
}

/** Zustimmen: speichern, dann Status setzen. */
export async function grantHealthConsent(userId: string): Promise<boolean> {
  const ok = await saveHealthConsent(userId, true);
  if (ok) markHealthConsentGranted(userId);
  return ok;
}

/** „Nicht jetzt“ in der Abfrage: für diese Version auf diesem Gerät nicht erneut fragen. */
export function declineHealthConsent(userId: string): void {
  writeHealthConsentDeclinedOnDevice(userId, true);
  setHealthConsentStatus(userId, "declined");
  settleHealthConsentDecision(false);
}
