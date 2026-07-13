"use strict";

const { handleStravaAuthRequest } = require("../_lib/stravaService");
const { handleCorsPreflight } = require("../_lib/cors");

/**
 * Vercel serverless function: GET /api/strava/auth
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  try {
    const { status, body, redirectUrl } = await handleStravaAuthRequest(req);
    if (redirectUrl) {
      return res.redirect(status, redirectUrl);
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(status).json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/strava/auth] unhandled error:", err?.message || err);
    return res.status(500).json({ error: "Strava auth failed" });
  }
};
