"use strict";

const { getAiHealthPayload } = require("../../_lib/aiHealth");
const { handleCorsPreflight } = require("../../_lib/cors");

/**
 * Vercel serverless function: GET /api/ai/health
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  return res.status(200).json(getAiHealthPayload());
};
