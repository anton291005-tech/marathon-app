"use strict";

/** Set CORS headers for Capacitor / web clients. Must run before route logic. */
function applyCors(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

module.exports = { applyCors, handleCorsPreflight };
