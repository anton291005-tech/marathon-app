"use strict";

const { handleDailyCoach } = require("../_lib/coachHandlers");

/**
 * Vercel serverless function: POST /api/ai/daily-coach
 * Daily coach decision card enhancement endpoint.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { status, body } = await handleDailyCoach(req.body);
    return res.status(status).json(body);
  } catch (err) {
    console.error("[api/ai/daily-coach] unhandled error:", err?.message || err); // eslint-disable-line no-console
    return res.status(200).json({ fallback: true });
  }
};
