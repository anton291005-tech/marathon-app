"use strict";

const { handleStravaCallbackRequest } = require("../_lib/stravaService");
const { handleCorsPreflight } = require("../_lib/cors");

/**
 * Vercel serverless function: GET /api/strava/callback
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  try {
    const { redirectUrl } = await handleStravaCallbackRequest(req);
    return res.redirect(302, redirectUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/strava/callback] unhandled error:", err?.message || err);
    return res.redirect(302, "myrace://strava-connected?status=error&reason=internal_error");
  }
};
