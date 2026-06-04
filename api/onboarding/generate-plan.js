"use strict";

const { generatePlanRulesWithClaude } = require("../_lib/claudePlanGenerator");

/**
 * Vercel serverless function: POST /api/onboarding/generate-plan
 */
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const { profile } = req.body || {};
    if (!profile) {
      return res.status(400).json({ error: "profile required" });
    }

    // eslint-disable-next-line no-console
    console.log("[API] POST /onboarding/generate-plan called");

    const rules = await generatePlanRulesWithClaude(profile);

    return res.status(200).json({
      rules: rules ?? null,
      analysis: rules?.analysis ?? "",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[api/onboarding/generate-plan] error:",
      typeof err?.message === "string" ? err.message : "unknown",
    );
    return res.status(200).json({ rules: null, analysis: "" });
  }
};
