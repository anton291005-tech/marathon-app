"use strict";

const { handleAiCoach } = require("./_lib/coachHandlers");
const { guardRequest, sendGuardFailure, coachRateLimitBody } = require("./_lib/apiGuard");
const { validateCoachBody } = require("./_lib/inputLimits");

/**
 * Vercel serverless function: POST /api/ai
 */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const guard = await guardRequest(req, {
      validate: validateCoachBody,
      bucket: "coach_chat",
      rateLimitBody: coachRateLimitBody,
    });
    if (!guard.ok) return sendGuardFailure(res, guard);
    // Nur Größen, nie Inhalte — Grundlage, um COACH_CONTEXT_MAX_BYTES später enger zu ziehen.
    // eslint-disable-next-line no-console
    console.log("[api/ai] request", JSON.stringify(guard.meta ?? {}));

    const { status, body } = await handleAiCoach(guard.payload);
    return res.status(status).json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/ai] unhandled error:", err?.message || err);
    return res.status(500).json({
      mode: "support",
      message:
        "Es gab einen internen Fehler beim Coach-Dienst. Tippe deine Frage **erneut ab**, oder wechsle kurz den Tab und zurück — dein Plan bleibt unverändert. Wenn es weiter hakt, formuliere dieselbe Bitte mit einem Satz weniger Details.",
      action: null,
    });
  }
};
