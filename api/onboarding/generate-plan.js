"use strict";

const {
  generatePlanStructureWithClaude,
  generatePlanRulesWithClaude,
} = require("../_lib/claudePlanGenerator");
const { handleCorsPreflight } = require("../_lib/cors");
const { guardRequest, sendGuardFailure } = require("../_lib/apiGuard");
const { validatePlanBody, legacyPlanProfile } = require("../_lib/inputLimits");

/**
 * Vercel serverless function: POST /api/onboarding/generate-plan
 *
 * Returns { structure: ClaudePlanStructure | null, analysis: string }
 * Claude generates a compact structure (phases + sessionNames + rules).
 * The full plan is built client-side by the deterministic generator.
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const guard = await guardRequest(req, { validate: validatePlanBody, bucket: "plan_structure" });
    if (!guard.ok) return sendGuardFailure(res, guard);
    // Der Struktur-Aufruf schickt das Profil als JSON an Claude: ohne die Plan-Eingaben bleibt er wie bisher.
    const profile = legacyPlanProfile(guard.payload.profile);

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
