import { getAppNow } from "../../../core/time/timeSystem";
import { AI_CONSENT_VERSION, type AiConsentRow } from "../../../features/aiConsent/aiConsentState";
import { supabase } from "../client";

/**
 * KI-Einwilligung in `profiles` (Migration 015). Zustimmen setzt Zeitpunkt + Textversion, Widerrufen setzt
 * beide auf NULL. Upsert, weil die Profilzeile bei neuen Konten noch fehlen kann; andere Spalten bleiben unberührt.
 */

export async function loadAiConsentRow(userId: string): Promise<{ ok: true; row: AiConsentRow } | { ok: false }> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("ai_consent_at, ai_consent_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, row: (data as AiConsentRow) ?? null };
  } catch {
    return { ok: false };
  }
}

export async function saveAiConsent(userId: string, granted: boolean): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        ai_consent_at: granted ? getAppNow().toISOString() : null,
        ai_consent_version: granted ? AI_CONSENT_VERSION : null,
      },
      { onConflict: "user_id" },
    );
    return !error;
  } catch {
    return false;
  }
}
