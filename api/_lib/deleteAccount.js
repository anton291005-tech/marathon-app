"use strict";

const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const USER_DATA_TABLES = [
  "plan_patches",
  "session_logs",
  "training_plans",
  "health_workouts",
  "recovery_daily",
  "coach_memory",
  "profiles",
];

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
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return match ? match[1].trim() : "";
}

/**
 * @param {import('http').IncomingMessage & { method?: string, headers?: Record<string, string> }} req
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
async function handleDeleteAccount(req) {
  if (req.method !== "DELETE") {
    return { status: 405, body: { error: "Method Not Allowed" } };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { status: 401, body: { error: "Missing Authorization bearer token" } };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    // eslint-disable-next-line no-console
    console.warn("[deleteAccount] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { status: 503, body: { error: "Account deletion is not configured" } };
  }

  let userId;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) {
      return { status: 401, body: { error: "Invalid or expired session" } };
    }
    userId = data.user.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[deleteAccount] getUser failed", err?.message || err);
    return { status: 401, body: { error: "Invalid or expired session" } };
  }

  try {
    for (const table of USER_DATA_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn(`[deleteAccount] delete from ${table} failed`, error.message);
        return { status: 500, body: { error: `Failed to delete user data (${table})` } };
      }
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      // eslint-disable-next-line no-console
      console.warn("[deleteAccount] admin.deleteUser failed", deleteUserError.message);
      return { status: 500, body: { error: "Failed to delete auth user" } };
    }

    return { status: 200, body: { success: true } };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[deleteAccount] caught error:",
      err?.message,
      err?.status,
      err?.code,
    );
    // eslint-disable-next-line no-console
    console.error("[deleteAccount] unhandled", err?.message || err);
    return { status: 500, body: { error: "Account deletion failed" } };
  }
}

module.exports = { handleDeleteAccount, USER_DATA_TABLES };
