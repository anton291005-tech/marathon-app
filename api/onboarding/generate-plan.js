"use strict";

const {
  generateFullPlanWithClaude,
  generatePlanRulesWithClaude,
} = require("../_lib/claudePlanGenerator");

/**
 * Vercel serverless function: POST /api/onboarding/generate-plan
 *
 * Returns { plan: TrainingPlanV2 | null, analysis: string }
 * Claude generates the full plan directly. generatePlanRulesWithClaude is kept
 * as a named export for the fallback path but is no longer called here.
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

    console.log("[API] POST /onboarding/generate-plan called");

    const plan = await generateFullPlanWithClaude(profile);

    return res.status(200).json({
      plan: plan ?? null,
      analysis: plan?.analysis ?? "",
    });
  } catch (err) {
    console.error(
      "[api/onboarding/generate-plan] error:",
      typeof err?.message === "string" ? err.message : "unknown",
    );
    return res.status(200).json({ plan: null, analysis: "" });
  }
};

// Re-export for tests / direct use
module.exports.generatePlanRulesWithClaude = generatePlanRulesWithClaude;
