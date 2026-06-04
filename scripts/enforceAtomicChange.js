/**
 * Atomic Change Enforcer — staged files only (git diff --cached).
 *
 * Redundant safety layer in the verify:strict pipeline (runs after featureTransaction.js).
 * Uses domainClassifier.js for all classification — no inline domain logic here.
 *
 * Rules:
 *   - Only staged files are analysed. Unstaged and untracked files are ignored.
 *   - Exactly ONE logical domain is allowed per staged set.
 *   - Violation: exit(1) with a clear report and split suggestion.
 */
"use strict";

const { spawnSync } = require("child_process");
const { groupByDomain } = require("./domainClassifier");

function getStagedFiles() {
  const res = spawnSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    // eslint-disable-next-line no-console
    console.error("[atomic] Could not read staged files:", res.error || res.stderr);
    process.exit(1);
  }
  return String(res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

const stagedFiles = getStagedFiles();

if (stagedFiles.length === 0) {
  // eslint-disable-next-line no-console
  console.error("[atomic] No staged files found. Stage your changes with 'git add' before running verify:atomic.");
  process.exit(1);
}

const byDomain = groupByDomain(stagedFiles);
const domains = Array.from(byDomain.keys());

if (domains.length > 1) {
  // eslint-disable-next-line no-console
  console.error(
    `[atomic] REJECTED: ${domains.length} domains detected in staged change (max: 1).\n` +
    `\nOffending domains and files:\n` +
    domains
      .map((d) => `  [${d}]\n${byDomain.get(d).map((f) => `    - ${f}`).join("\n")}`)
      .join("\n\n") +
    `\n\n→ Split this into ${domains.length} separate commits, one per domain.` +
    `\n→ Use 'git restore --staged <file>' to unstage unrelated files.`,
  );
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`[atomic] OK — single domain "${domains[0]}" (${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"}).`);
process.exit(0);
