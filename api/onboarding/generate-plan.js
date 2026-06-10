"use strict";

const {
  generatePlanStructureWithClaude,
  generatePlanRulesWithClaude,
} = require("../_lib/claudePlanGenerator");

/**
 * Vercel serverless function: POST /api/onboarding/generate-plan
 *
 * Returns { structure: ClaudePlanStructure | null, analysis: string }
 * Claude generates a compact structure (phases + sessionNames + rules).
 * The full plan is built client-side by the deterministic generator.
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

    const structure = await generatePlanStructureWithClaude(profile);

    return res.status(200).json({
      structure: structure ?? null,
      analysis: structure?.analysis ?? "",
    });
  } catch (err) {
    console.error(
      "[api/onboarding/generate-plan] error:",
      typeof err?.message === "string" ? err.message : "unknown",
    );
    return res.status(200).json({ structure: null, analysis: "" });
  }
};

// Re-export for tests / direct use
module.exports.generatePlanRulesWithClaude = generatePlanRulesWithClaude;
