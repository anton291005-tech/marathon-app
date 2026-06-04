/**
 * Domain Classifier — single source of truth for all pipeline scripts.
 *
 * Rules:
 *   - Prefix-based, deterministic, first-match wins.
 *   - All pipeline scripts MUST require this module; no inline domain logic elsewhere.
 *
 * Domain registry:
 *   ai         src/ai/**, src/lib/ai/**, api/_lib/**
 *   recovery   src/recovery/**
 *   core       src/core/**
 *   ui         src/components/**, src/ui/**, src/features/**, src/layout/**
 *   health     src/appleHealth/**, src/health/**
 *   training   src/trainingIntelligence/**
 *   config     scripts/**, server/**, api/**, public/**, ios/**, docs/**,
 *              root config files (package.json, tsconfig, capacitor, dotfiles)
 *   app        fallback — top-level src files (App.tsx, index.tsx, …)
 */
"use strict";

/** @type {Array<[string, RegExp]>} */
const DOMAIN_RULES = [
  ["ai",       /^(src\/ai\/|src\/lib\/ai\/|api\/_lib\/)/],
  ["recovery", /^src\/recovery\//],
  ["core",     /^src\/core\//],
  ["ui",       /^(src\/components\/|src\/ui\/|src\/features\/|src\/layout\/)/],
  ["health",   /^(src\/appleHealth\/|src\/health\/)/],
  ["training", /^src\/trainingIntelligence\//],
  // Root tooling + infra: scripts, server, api (non-_lib), ios, docs, public,
  // named root files (package.json, tsconfig*), and any root dotfile (.\w…)
  ["config",   /^(scripts\/|server\/|api\/|public\/|ios\/|docs\/|capacitor|package\.json|tsconfig|\.[a-z])/],
];

const CATCHALL_DOMAIN = "app";

/**
 * Return the domain for a repository-relative file path.
 * First-match wins; returns CATCHALL_DOMAIN if no rule matches.
 * @param {string} filePath
 * @returns {string}
 */
function classifyPath(filePath) {
  for (const [domain, re] of DOMAIN_RULES) {
    if (re.test(filePath)) return domain;
  }
  return CATCHALL_DOMAIN;
}

/**
 * Group a list of file paths by domain.
 * @param {string[]} files
 * @returns {Map<string, string[]>}
 */
function groupByDomain(files) {
  const map = new Map();
  for (const f of files) {
    const d = classifyPath(f);
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(f);
  }
  return map;
}

module.exports = { DOMAIN_RULES, CATCHALL_DOMAIN, classifyPath, groupByDomain };
