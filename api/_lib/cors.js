"use strict";

const CORS_ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";

/** Set CORS headers for Capacitor / web clients. Must run before route logic. */
function applyCors(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // DELETE: „Konto löschen“ (DELETE /api/account) kommt in der iOS-App von einem fremden Origin
  // (capacitor://localhost → Vercel). Ohne DELETE im Preflight blockiert die WebView die Anfrage.
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** Handle OPTIONS preflight; returns true when the request is fully handled. */
function handleCorsPreflight(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = { applyCors, handleCorsPreflight, CORS_ALLOWED_METHODS };
