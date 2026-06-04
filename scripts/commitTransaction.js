/**
 * Commit Transaction — side-effect-only commit step.
 *
 * Precondition: called only after `npm run verify:strict` (which already ran
 * featureTransaction.js as step 1). This script re-runs featureTransaction.js
 * to get the validated domain + featureId, then executes `git commit`.
 *
 * No validation logic lives here. No files are read from disk for state.
 *
 * Commit message format:  feat(<domain>): <featureId>
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const txScript = path.join(__dirname, "featureTransaction.js");

// Re-run featureTransaction to get the validated domain/featureId.
// Capture stdout so we can parse the final JSON record line.
const txRes = spawnSync(process.execPath, [txScript], { encoding: "utf8" });

// Always forward featureTransaction's output so the user can see it.
if (txRes.stdout) process.stdout.write(txRes.stdout);
if (txRes.stderr) process.stderr.write(txRes.stderr);

if (txRes.error || txRes.status !== 0) {
  // eslint-disable-next-line no-console
  console.error("[commit] Feature transaction validation failed. Cannot commit.");
  process.exit(1);
}

// The last non-empty stdout line is a JSON record from featureTransaction.js.
const stdoutLines = String(txRes.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
const lastLine = stdoutLines[stdoutLines.length - 1] || "";

let record;
try {
  record = JSON.parse(lastLine);
} catch {
  // eslint-disable-next-line no-console
  console.error("[commit] Could not parse transaction record from featureTransaction output.\n  Last line:", lastLine);
  process.exit(1);
}

if (!record || record.status !== "validated" || !record.domain || !record.featureId) {
  // eslint-disable-next-line no-console
  console.error("[commit] Transaction record is not validated:", record);
  process.exit(1);
}

const message = `feat(${record.domain}): ${record.featureId}`;
// eslint-disable-next-line no-console
console.log(`[commit] → git commit -m "${message}"`);

const commitRes = spawnSync("git", ["commit", "-m", message], { stdio: "inherit" });
if (commitRes.error || (typeof commitRes.status === "number" && commitRes.status !== 0)) {
  // eslint-disable-next-line no-console
  console.error("[commit] git commit failed.", commitRes.error || "");
  process.exit(1);
}

// Append to the feature ledger (non-fatal — commit is the source of truth).
const ledgerScript = path.join(__dirname, "featureLedger.js");
const ledgerRes = spawnSync(
  process.execPath,
  [ledgerScript, JSON.stringify({ featureId: record.featureId, domain: record.domain, files: record.files })],
  { stdio: "inherit" },
);
if (ledgerRes.error || (typeof ledgerRes.status === "number" && ledgerRes.status !== 0)) {
  // eslint-disable-next-line no-console
  console.error("[commit] Warning: ledger write failed (non-fatal). Commit succeeded.");
}

process.exit(0);
