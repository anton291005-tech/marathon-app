"use strict";

const { handleAiCoach } = require("../_lib/coachHandlers");

/**
 * Vercel serverless function: POST /api/ai
 * Main AI coach chat endpoint.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { status, body } = await handleAiCoach(req.body);
    return res.status(status).json(body);
  } catch (err) {
    // Catch module-level or unexpected errors so the client always gets JSON.
    console.error("[api/ai] unhandled error:", err?.message || err); // eslint-disable-line no-console
    return res.status(500).json({
      mode: "support",
      message: "Interner Fehler. Bitte erneut versuchen.",
      action: null,
    });
  }
};
