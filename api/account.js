"use strict";

const { handleDeleteAccount } = require("./_lib/deleteAccount");
const { handleCorsPreflight } = require("./_lib/cors");

/**
 * Vercel serverless function: DELETE /api/account
 */
module.exports = async function handler(req, res) {
  if (handleCorsPreflight(req, res)) return;

  res.setHeader("Content-Type", "application/json");
  try {
    const { status, body } = await handleDeleteAccount(req);
    return res.status(status).json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/account] unhandled error:", err?.message || err);
    return res.status(500).json({ error: "Account deletion failed" });
  }
};
