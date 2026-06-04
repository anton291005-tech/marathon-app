# Scope control (rulebook)

Use this when planning or executing changes in this repository. **Rules only — no executable logic.**

## Change isolation model

- Treat **each Cursor change as one atomic change unit**.
- **Validation tools** (`verify:diff`, pre-commit checks) use **`git diff --cached` only** — staged files are the only valid input; do not validate the full working tree or unrelated unstaged work.
- Do **not** evaluate cross-feature or workspace-wide diffs as a single unit; avoid multi-feature contamination and accidental large refactors.

## Hard scope limits

- **Max 3 files** per change.
- **Max 30 lines** changed per file (insertions + deletions count toward the limit where tooling applies).
- **No refactors**: no renames, no drive-by cleanup, no reorganizing imports or moving code unless that *is* the explicitly scoped task.

## What may be modified

- **Only** files **directly required** for the task.
- **Every** touched file must be **justified in one short sentence** (why this file, why now).

## Uncertainty

- If scope, behavior, or diff boundaries are **unclear**: **stop** and resolve before proceeding.

## Time system invariant

- Outside `src/core/time/timeSystem.ts` (and tests exempted in ESLint):
  - Forbidden: `new Date()` with no arguments.
  - Forbidden: `Date.now()`.
- Prefer: `getAppNow()`, `getAppNowEpochMs()` from the time system.
