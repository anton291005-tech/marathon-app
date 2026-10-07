"use strict";

const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

function readEnvTrimmed(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function getSupabaseUrl() {
  return readEnvTrimmed("REACT_APP_SUPABASE_URL") || readEnvTrimmed("SUPABASE_URL");
}

function getServiceRoleKey() {
  const key = readEnvTrimmed("SUPABASE_SERVICE_ROLE_KEY");
  return key.length > 0 ? key : "";
}

function createSupabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extractBearerToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1].trim() : "";
}

/** Supabase access tokens are JWTs: three base64url segments. Anything else is rejected without a network call. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Pflicht-Bearer-Prüfung für alle kostenpflichtigen Endpunkte: verifiziert das Supabase-Session-Token
 * aus dem `Authorization`-Header gegen Supabase Auth.
 *
 * @param {{ headers?: Record<string, string> }} req
 * @returns {Promise<
 *   | { ok: true, userId: string, admin: import('@supabase/supabase-js').SupabaseClient }
 *   | { ok: false, status: 401 | 503, reason: "missing_token" | "invalid_token" | "not_configured", body: { error: string } }
 * >}
 */
async function requireUser(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, reason: "missing_token", body: { error: "Missing Authorization bearer token" } };
  }
  if (!JWT_SHAPE.test(token)) {
    return { ok: false, status: 401, reason: "invalid_token", body: { error: "Invalid or expired session" } };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    // eslint-disable-next-line no-console
    console.warn("[requireUser] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { ok: false, status: 503, reason: "not_configured", body: { error: "Authentication is not configured" } };
  }

  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) {
      return { ok: false, status: 401, reason: "invalid_token", body: { error: "Invalid or expired session" } };
    }
    return { ok: true, userId: data.user.id, admin };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[requireUser] getUser failed", err?.message || err);
    return { ok: false, status: 401, reason: "invalid_token", body: { error: "Invalid or expired session" } };
  }
}

module.exports = { requireUser, extractBearerToken, createSupabaseAdminClient };
