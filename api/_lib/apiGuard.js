"use strict";

const { requireUser } = require("./requireUser");

/**
 * Gemeinsamer Türsteher der kostenpflichtigen Endpunkte (Vercel-Funktionen und Express-Routen):
 * ohne gültiges Supabase-Session-Token erreicht kein Request einen KI-Aufruf.
 *
 * Reihenfolge: Token → Eingabelimits (`options.validate`, siehe `inputLimits.js`). Der Handler bekommt
 * nur `payload`, nie den rohen Body.
 *
 * @param {{ headers?: Record<string, string>, body?: unknown }} req
 * @param {{ validate?: (body: unknown) => { ok: true, payload: object, meta?: object } | { ok: false, status: number, body: { error: string } } }} [options]
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

  return { ok: true, userId: auth.userId, payload: validated.payload, meta: validated.meta };
}

/** Schreibt die Ablehnung eines `guardRequest` in eine Vercel-/Express-Response. */
function sendGuardFailure(res, guard) {
  for (const [name, value] of Object.entries(guard.headers ?? {})) res.setHeader(name, value);
  return res.status(guard.status).json(guard.body);
}

module.exports = { guardRequest, sendGuardFailure };
