"use strict";

/**
 * Rate Limit je Nutzer für die kostenpflichtigen Endpunkte. Zähler und Fensterlogik liegen in Postgres
 * (`public.consume_api_quota`, Migration 014) — keine zusätzliche Infrastruktur. Jeder Eintrag eines
 * Buckets muss eingehalten sein.
 */
const API_QUOTAS = {
  coach_chat: [
    { windowSeconds: 60 * 60, limit: 30 },
    { windowSeconds: 24 * 60 * 60, limit: 150 },
  ],
  plan_full: [{ windowSeconds: 24 * 60 * 60, limit: 5 }],
  plan_structure: [{ windowSeconds: 24 * 60 * 60, limit: 10 }],
};

/** Nutzer-IDs ohne Limit (eigener Account beim Testen): `API_QUOTA_EXEMPT_USER_IDS`, durch Komma oder Leerraum getrennt. */
function isQuotaExempt(userId) {
  const raw = process.env.API_QUOTA_EXEMPT_USER_IDS;
  if (typeof raw !== "string" || !raw.trim()) return false;
  return raw
    .split(/[\s,]+/)
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(userId).toLowerCase());
}

/**
 * Zählt einen Aufruf und meldet, ob er im Limit liegt.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin Service-Role-Client
 * @param {string} userId verifizierte Nutzer-ID aus `requireUser`
 * @param {keyof typeof API_QUOTAS} bucket
 * @returns {Promise<{ allowed: true } | { allowed: false, retryAfterSeconds: number }>}
 */
async function consumeApiQuota(admin, userId, bucket) {
  const rules = API_QUOTAS[bucket];
  if (!rules) throw new Error(`Unknown quota bucket: ${bucket}`);
  if (isQuotaExempt(userId)) return { allowed: true };

  const results = await Promise.all(
    rules.map(async ({ windowSeconds, limit }) => {
      try {
        const { data, error } = await admin.rpc("consume_api_quota", {
          p_user_id: userId,
          p_bucket: bucket,
          p_limit: limit,
          p_window_seconds: windowSeconds,
        });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row || typeof row.allowed !== "boolean") {
          throw new Error(error?.message || "unexpected consume_api_quota result");
        }
        return { allowed: row.allowed, retryAfterSeconds: Number(row.retry_after_seconds) || windowSeconds };
      } catch (err) {
        // Bewusst fail-open: ist die Datenbank nicht erreichbar oder Migration 014 noch nicht angewendet,
        // geht der Aufruf durch. Die App muss benutzbar bleiben; der Schutz vor anonymen Aufrufen ist die
        // Token-Prüfung davor (die ist fail-closed), das Limit deckelt nur den Verbrauch angemeldeter Nutzer.
        // eslint-disable-next-line no-console
        console.warn(`[apiQuota] limit check failed for bucket=${bucket}, letting the request through:`, err?.message || err);
        return { allowed: true, retryAfterSeconds: 0 };
      }
    }),
  );

  const denied = results.filter((result) => !result.allowed);
  if (denied.length === 0) return { allowed: true };
  // Das am längsten gesperrte Fenster bestimmt, wann ein neuer Versuch wieder durchgeht.
  return { allowed: false, retryAfterSeconds: Math.max(...denied.map((result) => result.retryAfterSeconds)) };
}

module.exports = { API_QUOTAS, consumeApiQuota, isQuotaExempt };
