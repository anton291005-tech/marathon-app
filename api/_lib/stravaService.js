// DEPLOYMENT: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REDIRECT_URI und
// SUPABASE_SERVICE_ROLE_KEY muessen als Vercel Environment Variables gesetzt sein.
"use strict";

const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();
require("dotenv").config({ path: ".env.local", override: true });

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_SCOPE = "read,activity:read_all";
const STRAVA_DEEP_LINK_BASE = "myrace://strava-connected";
const REFRESH_BUFFER_SECONDS = 300;

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

function getStravaClientId() {
  return readEnvTrimmed("STRAVA_CLIENT_ID");
}

function getStravaClientSecret() {
  return readEnvTrimmed("STRAVA_CLIENT_SECRET");
}

function getStravaRedirectUri() {
  return readEnvTrimmed("STRAVA_REDIRECT_URI");
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

function buildStravaDeepLink(status, extra = {}) {
  const params = new URLSearchParams({ status, ...extra });
  return `${STRAVA_DEEP_LINK_BASE}?${params.toString()}`;
}

/**
 * @param {import('http').IncomingMessage & { query?: Record<string, string> }} req
 * @returns {{ status: number, body?: Record<string, unknown>, redirectUrl?: string }}
 */
async function handleStravaAuthRequest(req) {
  const clientId = getStravaClientId();
  const redirectUri = getStravaRedirectUri();
  if (!clientId || !redirectUri) {
    // eslint-disable-next-line no-console
    console.warn("[strava] missing STRAVA_CLIENT_ID or STRAVA_REDIRECT_URI");
    return { status: 503, body: { error: "Strava integration is not configured" } };
  }

  const token = typeof req.query?.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    return { status: 401, body: { error: "Missing session token" } };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    // eslint-disable-next-line no-console
    console.warn("[strava] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { status: 503, body: { error: "Strava integration is not configured" } };
  }

  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) {
      return { status: 401, body: { error: "Invalid or expired session" } };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[strava] getUser failed", err?.message || err);
    return { status: 401, body: { error: "Invalid or expired session" } };
  }

  const authUrl = new URL(STRAVA_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("approval_prompt", "auto");
  authUrl.searchParams.set("scope", STRAVA_SCOPE);
  authUrl.searchParams.set("state", token);

  return { status: 302, redirectUrl: authUrl.toString() };
}

async function exchangeCodeForToken(code) {
  const clientId = getStravaClientId();
  const clientSecret = getStravaClientSecret();
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Strava token exchange HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }
  return response.json();
}

async function refreshStravaAccessToken(refreshToken) {
  const clientId = getStravaClientId();
  const clientSecret = getStravaClientSecret();
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Strava token refresh HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }
  return response.json();
}

async function upsertStravaConnection(admin, userId, tokenData) {
  const { error } = await admin.from("strava_connections").upsert(
    {
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
      strava_athlete_id: tokenData.athlete?.id ?? tokenData.strava_athlete_id,
      scope: STRAVA_SCOPE,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error(`Strava connection upsert failed: ${error.message}`);
  }
}

/**
 * @param {import('http').IncomingMessage & { query?: Record<string, string> }} req
 * @returns {{ redirectUrl: string }}
 */
async function handleStravaCallbackRequest(req) {
  const { code, state, error: stravaError } = req.query || {};

  if (stravaError) {
    return { redirectUrl: buildStravaDeepLink("error", { reason: "denied" }) };
  }
  if (typeof code !== "string" || !code || typeof state !== "string" || !state) {
    return { redirectUrl: buildStravaDeepLink("error", { reason: "missing_params" }) };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    // eslint-disable-next-line no-console
    console.warn("[strava] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return { redirectUrl: buildStravaDeepLink("error", { reason: "not_configured" }) };
  }

  let userId;
  try {
    const { data, error } = await admin.auth.getUser(state);
    if (error || !data?.user?.id) {
      return { redirectUrl: buildStravaDeepLink("error", { reason: "invalid_session" }) };
    }
    userId = data.user.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[strava] getUser failed", err?.message || err);
    return { redirectUrl: buildStravaDeepLink("error", { reason: "invalid_session" }) };
  }

  let tokenData;
  try {
    tokenData = await exchangeCodeForToken(code);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[strava] token exchange failed", err?.message || err);
    return { redirectUrl: buildStravaDeepLink("error", { reason: "token_exchange_failed" }) };
  }

  try {
    await upsertStravaConnection(admin, userId, tokenData);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[strava] connection save failed", err?.message || err);
    return { redirectUrl: buildStravaDeepLink("error", { reason: "save_failed" }) };
  }

  return { redirectUrl: buildStravaDeepLink("connected") };
}

/**
 * Internal service: returns a valid (non-expired) Strava access token for a user,
 * refreshing it first if it is expired or about to expire. Returns null if the
 * user has no Strava connection.
 */
async function getValidStravaAccessToken(userId, adminOverride) {
  const admin = adminOverride || createSupabaseAdminClient();
  if (!admin) {
    throw new Error("Strava integration is not configured");
  }

  const { data: connection, error } = await admin
    .from("strava_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Strava connection lookup failed: ${error.message}`);
  }
  if (!connection) {
    return null;
  }

  const expiresAtMs = Date.parse(connection.expires_at);
  const needsRefresh = !Number.isFinite(expiresAtMs)
    || expiresAtMs <= Date.now() + REFRESH_BUFFER_SECONDS * 1000;

  if (!needsRefresh) {
    return connection.access_token;
  }

  const refreshed = await refreshStravaAccessToken(connection.refresh_token);
  const { error: updateError } = await admin
    .from("strava_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`Strava connection refresh update failed: ${updateError.message}`);
  }

  return refreshed.access_token;
}

module.exports = {
  handleStravaAuthRequest,
  handleStravaCallbackRequest,
  getValidStravaAccessToken,
  createSupabaseAdminClient,
};
