/**
 * Feature Transaction Validator — pure, no side effects.
 *
 * Reads ONLY staged files (git diff --cached --name-only).
 * Uses domainClassifier.js for all classification — no inline domain logic here.
 *
 * Validation rules:
 *   ✔ At least 1 file must be staged
 *   ✔ Exactly ONE domain may appear in the staged set
 *   ✔ Cross-domain leakage is a hard rejection
 *
 * Output:
 *   VALID   → human-readable summary to stdout; final stdout line is a JSON record
 *             {"status":"validated","domain":"...","featureId":"...","files":[...]}
 *             → exit(0)
 *   INVALID → human-readable report to stderr; exit(1)
 *
 * The JSON final line is parsed by scripts/commitTransaction.js.
 * No files are written. No state is mutated.
 */
"use strict";

const { spawnSync } = require("child_process");
const { groupByDomain } = require("./domainClassifier");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStagedFiles() {
  const res = spawnSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    // eslint-disable-next-line no-console
    console.error("[transaction] Could not read staged files:", res.error || res.stderr);
    process.exit(1);
  }
  return String(res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

function shortGitRef() {
  const res = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  if (res.error || res.status !== 0) return "unknown";
  return String(res.stdout || "").trim();
}

function makeFeatureId(domain) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `tx-${stamp}-${shortGitRef()}-${domain}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  // eslint-disable-next-line no-console
  console.error(
    "[transaction] REJECTED: No staged files.\n" +
    "→ Run 'git add <files>' to stage your changes before verify:transaction.",
  );
  process.exit(1);
}

const byDomain = groupByDomain(stagedFiles);
const domains = Array.from(byDomain.keys());

if (domains.length > 1) {
  // eslint-disable-next-line no-console
  console.error(
    `[transaction] REJECTED: ${domains.length} domains detected in staged change (max: 1).\n` +
    `\nOffending domains and files:\n` +
    domains
      .map((d) => `  [${d}]\n${byDomain.get(d).map((f) => `    - ${f}`).join("\n")}`)
      .join("\n\n") +
    `\n\n→ Split into ${domains.length} separate commits, one per domain.` +
    `\n→ Use 'git restore --staged <file>' to unstage unrelated files.`,
  );
  process.exit(1);
}

const domain = domains[0];
const featureId = makeFeatureId(domain);

// Human-readable summary — visible when run via `npm run verify:transaction`
// eslint-disable-next-line no-console
console.log(
  `[transaction] OK\n` +
  `  featureId : ${featureId}\n` +
  `  domain    : ${domain}\n` +
  `  files     : ${stagedFiles.length}`,
);

// Machine-readable record — final stdout line, parsed by commitTransaction.js
// eslint-disable-next-line no-console
console.log(JSON.stringify({ status: "validated", domain, featureId, files: stagedFiles }));

process.exit(0);
