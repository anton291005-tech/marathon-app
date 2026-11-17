"use strict";

const { handleStravaSyncRequest } = require("../_lib/stravaActivitySync");
const { handleCorsPreflight } = require("../_lib/cors");

/**
 * Vercel serverless function: POST /api/strava/sync
 * Importiert die Läufe des angemeldeten Nutzers von Strava nach `health_workouts`.
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { status, body, headers } = await handleStravaSyncRequest(req);
    for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
    return res.status(status).json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/strava/sync] unhandled error:", err?.message || err);
    return res.status(500).json({ status: "error" });
  }
};
