"use strict";

const { requireUser } = require("./requireUser");
const { consumeApiQuota } = require("./apiQuota");

/**
 * Gemeinsamer Türsteher der kostenpflichtigen Endpunkte (Vercel-Funktionen und Express-Routen):
 * ohne gültiges Supabase-Session-Token erreicht kein Request einen KI-Aufruf.
 *
 * Reihenfolge: Token → Eingabelimits (`options.validate`, siehe `inputLimits.js`) → Rate Limit
 * (`options.bucket`, siehe `apiQuota.js`). Eine abgelehnte Eingabe verbraucht damit kein Kontingent.
 * Der Handler bekommt nur `payload`, nie den rohen Body.
 *
 * @param {{ headers?: Record<string, string>, body?: unknown }} req
 * @param {{
 *   validate?: (body: unknown) => { ok: true, payload: object, meta?: object } | { ok: false, status: number, body: { error: string } },
 *   bucket?: "coach_chat" | "plan_full" | "plan_structure",
 *   rateLimitBody?: (retryAfterSeconds: number) => object,
 * }} [options] `rateLimitBody` ersetzt den 429-Body (der Coach-Chat braucht dort eine anzeigbare Nachricht).
 * @returns {Promise<
 *   | { ok: true, userId: string, payload: any, meta?: object }
 *   | { ok: false, status: number, body: { error: string }, headers?: Record<string, string> }
 * >}
 */
async function guardRequest(req, options = {}) {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, status: auth.status, body: auth.body };

  const validated = options.validate ? options.validate(req.body) : { ok: true, payload: req.body };
  if (!validated.ok) return { ok: false, status: validated.status, body: validated.body };

  if (options.bucket) {
    const quota = await consumeApiQuota(auth.admin, auth.userId, options.bucket);
    if (!quota.allowed) {
      return {
        ok: false,
        status: 429,
        headers: { "Retry-After": String(quota.retryAfterSeconds) },
        body: options.rateLimitBody
          ? options.rateLimitBody(quota.retryAfterSeconds)
          : { error: "Rate limit exceeded", retryAfterSeconds: quota.retryAfterSeconds },
      };
    }
  }

  return { ok: true, userId: auth.userId, payload: validated.payload, meta: validated.meta };
}

/** Schreibt die Ablehnung eines `guardRequest` in eine Vercel-/Express-Response. */
function sendGuardFailure(res, guard) {
  for (const [name, value] of Object.entries(guard.headers ?? {})) res.setHeader(name, value);
  return res.status(guard.status).json(guard.body);
}

/**
 * 429-Body für POST /api/ai in der Form einer Coach-Antwort (`mode` + `message`): der Client zeigt sie
 * ohne Änderung als normale Chat-Zeile an, statt in seine generische Fehlermeldung zu fallen.
 */
function coachRateLimitBody(retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const wait = minutes >= 120 ? `${Math.ceil(minutes / 60)} Stunden` : `${minutes} Minuten`;
  return {
    mode: "support",
    message: `Du hast das Limit für Coach-Anfragen erreicht. In etwa ${wait} geht es weiter — dein Plan bleibt bis dahin unverändert nutzbar.`,
    action: null,
    error: "Rate limit exceeded",
    retryAfterSeconds,
  };
}

module.exports = { guardRequest, sendGuardFailure, coachRateLimitBody };
