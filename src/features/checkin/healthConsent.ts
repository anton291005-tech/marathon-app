/**
 * Zustimmung zur Speicherung von Gesundheitsangaben (Check-in, Chips) — Spec §15, Migration 017.
 * Getrennt von der KI-Einwilligung: Diese Zustimmung erlaubt nur das Speichern im eigenen Konto, nicht die
 * Weitergabe an einen KI-Anbieter.
 */

import { getAppNow } from "../../core/time/timeSystem";
import { supabase } from "../../lib/supabase/client";

/** Version des Zustimmungstexts; bei wesentlicher Änderung erhöhen (dann wird erneut gefragt). */
export const HEALTH_CONSENT_VERSION = "1";

export const HEALTH_CONSENT_TEXT =
  "MyRace speichert deine Antworten in deinem Konto, um deine Tagesform zu berechnen. Sie werden nicht für Werbung genutzt und nicht verkauft. An den KI-Coach gehen sie nur, wenn du dem gesondert zugestimmt hast.";

export type HealthConsentRow = { health_consent_at: string | null; health_consent_version: string | null } | null;

export function isHealthConsentGranted(row: HealthConsentRow): boolean {
  return !!row && typeof row.health_consent_at === "string" && row.health_consent_version === HEALTH_CONSENT_VERSION;
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
