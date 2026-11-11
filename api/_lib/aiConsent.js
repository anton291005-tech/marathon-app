"use strict";

/**
 * KI-Einwilligung (App-Store-Regel 5.1.2(i), Migration 015): Ohne ausdrückliche Zustimmung geht kein
 * Nutzerinhalt an Anthropic. Quelle der Wahrheit ist `profiles.ai_consent_at` / `ai_consent_version`.
 *
 * Anders als das Rate Limit (fail open) schlägt diese Prüfung bei Datenbankfehlern geschlossen fehl:
 * es geht um eine Rechtsgrundlage, nicht um Kosten.
 *
 * Spiegel im Client: `src/features/aiConsent/aiConsentState.ts` (`AI_CONSENT_VERSION`), per Test gleich gehalten.
 */

/** Mindestversion des Einwilligungstexts. Anheben, wenn sich Anbieter oder Datenarten wesentlich ändern. */
const AI_CONSENT_VERSION = 1;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 * @returns {Promise<{ ok: true, granted: boolean } | { ok: false }>}
 */
async function readAiConsent(admin, userId) {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("ai_consent_at, ai_consent_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[aiConsent] read failed", error.code || "", error.message || "");
      return { ok: false };
    }
    const at = data?.ai_consent_at;
    const version = data?.ai_consent_version;
    const granted = typeof at === "string" && at.length > 0 && typeof version === "number" && version >= AI_CONSENT_VERSION;
    return { ok: true, granted };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[aiConsent] read threw", err?.message || err);
    return { ok: false };
  }
}

/** 403-Body für POST /api/ai in Form einer Coach-Antwort, damit der Client ihn als Chat-Zeile zeigt. */
const COACH_CONSENT_REQUIRED_BODY = Object.freeze({
  mode: "support",
  message:
    "Der KI-Coach ist aus, weil du der Datenweitergabe an Anthropic (Claude) nicht zugestimmt hast. Du kannst ihn unter Einstellungen → Datenschutz & Daten → KI-Coach aktivieren.",
  action: null,
  error: "ai_consent_required",
});

/** 503-Body, wenn die Einwilligung nicht gelesen werden konnte. */
const COACH_CONSENT_UNAVAILABLE_BODY = Object.freeze({
  mode: "support",
  message: "Der Coach ist gerade nicht erreichbar. Versuch es in ein paar Minuten noch einmal — dein Plan bleibt unverändert nutzbar.",
  action: null,
  error: "ai_consent_unavailable",
});

module.exports = {
  AI_CONSENT_VERSION,
  readAiConsent,
  COACH_CONSENT_REQUIRED_BODY,
  COACH_CONSENT_UNAVAILABLE_BODY,
};
