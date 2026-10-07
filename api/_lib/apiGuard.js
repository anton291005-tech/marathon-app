"use strict";

const { requireUser } = require("./requireUser");

/**
 * Gemeinsamer Türsteher der kostenpflichtigen Endpunkte (Vercel-Funktionen und Express-Routen):
 * ohne gültiges Supabase-Session-Token erreicht kein Request einen KI-Aufruf.
 *
 * @param {{ headers?: Record<string, string>, body?: unknown }} req
 * @returns {Promise<
 *   | { ok: true, userId: string }
 *   | { ok: false, status: number, body: { error: string }, headers?: Record<string, string> }
 * >}
 */
async function guardRequest(req) {
  const auth = await requireUser(req);
  if (!auth.ok) return { ok: false, status: auth.status, body: auth.body };
  return { ok: true, userId: auth.userId };
}

/** Schreibt die Ablehnung eines `guardRequest` in eine Vercel-/Express-Response. */
function sendGuardFailure(res, guard) {
  for (const [name, value] of Object.entries(guard.headers ?? {})) res.setHeader(name, value);
  return res.status(guard.status).json(guard.body);
}

module.exports = { guardRequest, sendGuardFailure };
