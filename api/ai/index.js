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
  const { status, body } = await handleAiCoach(req.body || {});
  return res.status(status).json(body);
};
