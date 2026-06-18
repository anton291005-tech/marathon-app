"use strict";

const { handleOnboardingPreferencesPatches } = require("../_lib/onboardingPreferencesPatches");
const { handleCorsPreflight } = require("../_lib/cors");

/**
 * Vercel serverless function: POST /api/onboarding/preferences-patches
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { status, body } = await handleOnboardingPreferencesPatches(req.body);
    return res.status(status).json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/onboarding/preferences-patches] unhandled error:", err?.message || err);
    return res.status(200).json({ rules: {}, analysis: "" });
  }
};
