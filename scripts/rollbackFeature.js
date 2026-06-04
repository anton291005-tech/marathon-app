/**
 * Feature Rollback — safely revert a committed feature transaction.
 *
 * Usage:
 *   node scripts/rollbackFeature.js <featureId>
 *
 * Behavior:
 *   1. Read logs/feature-ledger.json
 *   2. Find the entry matching <featureId>
 *   3. Run `git revert <commitHash> --no-edit`  (non-destructive — adds a new revert commit)
 *   4. Update the ledger entry status → "rolled_back"
 *
 * Safety rules:
 *   - NO git reset --hard or any destructive operation
 *   - Ledger history is never deleted; only status is updated on the matching entry
 *   - Rollback is blocked if entry is already rolled_back
 *   - Rollback is blocked if entry has no valid commitHash
 *   - Ledger update failure after a successful revert is non-fatal (warns only)
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const LEDGER_PATH = path.join(process.cwd(), "logs", "feature-ledger.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    // eslint-disable-next-line no-console
    console.error("[rollback] Ledger file not found:", LEDGER_PATH);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(LEDGER_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Ledger root is not an array.");
    return parsed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[rollback] Could not parse ledger:", err.message);
    process.exit(1);
  }
}

function writeLedger(entries) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const featureId = process.argv[2];

if (!featureId) {
  // eslint-disable-next-line no-console
  console.error("[rollback] Usage: node scripts/rollbackFeature.js <featureId>");
  process.exit(1);
}

const ledger = readLedger();

const idx = ledger.findIndex((e) => e.featureId === featureId);
if (idx === -1) {
  // eslint-disable-next-line no-console
  console.error(
    `[rollback] Feature not found in ledger: ${featureId}\n` +
    `\nAvailable features (${ledger.length} total):\n` +
    (ledger.length === 0
      ? "  (ledger is empty)"
      : ledger.map((e) => `  ${e.status === "rolled_back" ? "↩" : "✓"} ${e.featureId}  [${e.status}]  ${e.commitHash ? e.commitHash.slice(0, 8) : "??"}`).join("\n")),
  );
  process.exit(1);
}

const entry = ledger[idx];

if (entry.status === "rolled_back") {
  // eslint-disable-next-line no-console
  console.error(`[rollback] Feature ${featureId} has already been rolled back. Nothing to do.`);
  process.exit(1);
}

const { commitHash } = entry;
if (!commitHash || commitHash === "unknown") {
  // eslint-disable-next-line no-console
  console.error(`[rollback] Feature ${featureId} has no valid commitHash — cannot revert.`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(
  `[rollback] Reverting commit ${commitHash.slice(0, 8)} for feature:\n` +
  `  featureId : ${entry.featureId}\n` +
  `  domain    : ${entry.domain}\n` +
  `  files     : ${entry.files.join(", ")}`,
);

// Non-destructive revert — creates a new commit that undoes the change.
// --no-edit skips the commit message editor.
const revertRes = spawnSync("git", ["revert", commitHash, "--no-edit"], { stdio: "inherit" });

if (revertRes.error || (typeof revertRes.status === "number" && revertRes.status !== 0)) {
  // eslint-disable-next-line no-console
  console.error(
    "[rollback] git revert failed. Ledger NOT modified. Git history preserved.\n" +
    "           Resolve any conflicts manually, then re-run rollback.",
  );
  process.exit(1);
}

// Update only the status field of the matching entry; all other fields are preserved.
ledger[idx] = { ...entry, status: "rolled_back" };

try {
  writeLedger(ledger);
  // eslint-disable-next-line no-console
  console.log(`[rollback] Ledger updated: ${featureId} → rolled_back`);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[rollback] Warning: could not update ledger status (non-fatal):", err.message);
}

process.exit(0);
