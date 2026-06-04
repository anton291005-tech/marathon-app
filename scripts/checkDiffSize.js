/**
 * Validates ONE atomic change unit: STAGED files only (`git diff --cached`).
 * Each Cursor change should stage only what belongs together; no workspace-wide diff.
 */
const { spawnSync } = require("child_process");

function runGitNumstat() {
  const res = spawnSync("git", ["diff", "--cached", "--numstat"], { encoding: "utf8" });
  if (res.error) return { ok: false, output: "", error: String(res.error) };
  const out = typeof res.stdout === "string" ? res.stdout : "";
  return { ok: res.status === 0, output: out, error: res.status === 0 ? "" : String(res.stderr || "") };
}

function parseTotalChangedLines(numstatOutput) {
  const lines = String(numstatOutput || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let total = 0;
  for (const line of lines) {
    // Format: added<TAB>deleted<TAB>path ; binary files show "-" for counts.
    const parts = line.split("\t");
    const a = parts[0];
    const d = parts[1];
    const added = a === "-" ? 0 : Number(a);
    const deleted = d === "-" ? 0 : Number(d);
    if (Number.isFinite(added)) total += added;
    if (Number.isFinite(deleted)) total += deleted;
  }
  return total;
}

const LIMIT = 60;
const res = runGitNumstat();
if (!res.ok) {
  // eslint-disable-next-line no-console
  console.error("[verify:diff] failed to read git diff --cached --numstat:", res.error);
  process.exit(1);
}

const total = parseTotalChangedLines(res.output);
if (total > LIMIT) {
  // eslint-disable-next-line no-console
  console.error(`[verify:diff] Diff too large: ${total} changed lines (limit ${LIMIT}).`);
  process.exit(1);
}

process.exit(0);

