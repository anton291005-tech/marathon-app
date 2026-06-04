"use strict";

const { handleAiCoach } = require("./_lib/coachHandlers");

/**
 * Vercel serverless function: POST /api/ai
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
    // eslint-disable-next-line no-console
    console.error("[api/ai] unhandled error:", err?.message || err);
    return res.status(500).json({
      mode: "support",
      message:
        "Es gab einen internen Fehler beim Coach-Dienst. Tippe deine Frage **erneut ab**, wechsle kurz den Tab und zurück, oder sichere vorher **Einstellungen → Backup JSON** — dein Plan bleibt lokal auf dem Gerät. Wenn es weiter hakt, formuliere dieselbe Bitte mit einem Satz weniger Details.",
      action: null,
    });
  }
};
