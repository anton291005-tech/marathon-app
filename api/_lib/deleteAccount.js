// DEPLOYMENT: SUPABASE_SERVICE_ROLE_KEY muss als Vercel Environment Variable gesetzt sein.
// Vercel Dashboard → Settings → Environment Variables → SUPABASE_SERVICE_ROLE_KEY (Production)
"use strict";

const { requireUser } = require("./requireUser");

const USER_DATA_TABLES = [
  "api_usage",
  "prep_recaps",
  "plan_patches",
  "session_logs",
  "training_plans",
  "health_workouts",
  "recovery_daily",
  "coach_memory",
  "profiles",
  // TODO: add "marathon_logs" once table is created
];

/**
 * @param {import('http').IncomingMessage & { method?: string, headers?: Record<string, string> }} req
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
async function handleDeleteAccount(req) {
  if (req.method !== "DELETE") {
    return { status: 405, body: { error: "Method Not Allowed" } };
  }

  const auth = await requireUser(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return { status: 503, body: { error: "Account deletion is not configured" } };
    }
    return { status: auth.status, body: auth.body };
  }
  const { admin, userId } = auth;

  try {
    const deletedTables = [];
    const failedTables = [];
    for (const table of USER_DATA_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn(`[deleteAccount] delete from ${table} failed`, error.message);
        failedTables.push(table);
      } else {
        deletedTables.push(table);
      }
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      // eslint-disable-next-line no-console
      console.warn("[deleteAccount] admin.deleteUser failed", deleteUserError.message);
      return { status: 500, body: { error: "Failed to delete auth user", deletedTables, failedTables } };
    }

    return { status: 200, body: { success: true, deletedTables, failedTables } };
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
