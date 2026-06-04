/**
 * Feature Ledger — append-only audit log for committed feature transactions.
 *
 * Called by scripts/commitTransaction.js AFTER a successful `git commit`.
 * Failure here is NON-FATAL: the commit is the source of truth.
 *
 * Usage (internal — not called directly by developers):
 *   node scripts/featureLedger.js '<JSON transaction record>'
 *
 * argv[2] must be the JSON record emitted by featureTransaction.js:
 *   { status, domain, featureId, files }
 *
 * Ledger entry shape (appended to logs/feature-ledger.json):
 *   { featureId, domain, files, timestamp, commitHash, status }
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const LEDGER_PATH = path.join(process.cwd(), "logs", "feature-ledger.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCommitHash() {
  const res = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (res.error || res.status !== 0) return "unknown";
  return String(res.stdout || "").trim();
}

function readLedger() {
  try {
    if (!fs.existsSync(LEDGER_PATH)) return [];
    const raw = fs.readFileSync(LEDGER_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted or missing — start fresh (entries are never deleted)
    return [];
  }
}

function writeLedger(entries) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const rawRecord = process.argv[2];
if (!rawRecord) {
  // eslint-disable-next-line no-console
  console.error("[ledger] No transaction record provided (argv[2] missing).");
  process.exit(1);
}

let record;
try {
  record = JSON.parse(rawRecord);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[ledger] Invalid transaction record JSON:", err.message);
  process.exit(1);
}

const commitHash = getCommitHash();

/** @type {{ featureId: string, domain: string, files: string[], timestamp: string, commitHash: string, status: "committed" }} */
const entry = {
  featureId: String(record.featureId || "unknown"),
  domain:    String(record.domain    || "unknown"),
  files:     Array.isArray(record.files) ? record.files : [],
  timestamp: new Date().toISOString(),
  commitHash,
  status: "committed",
};

try {
  const ledger = readLedger();
  ledger.push(entry);
  writeLedger(ledger);
  // eslint-disable-next-line no-console
  console.log(`[ledger] Appended: ${entry.featureId} → ${commitHash.slice(0, 8)} (${entry.domain})`);
} catch (err) {
  // Non-fatal — commit already succeeded; warn but do not exit(1)
  // eslint-disable-next-line no-console
  console.error("[ledger] Warning: could not write ledger (non-fatal):", err.message);
}

process.exit(0);
