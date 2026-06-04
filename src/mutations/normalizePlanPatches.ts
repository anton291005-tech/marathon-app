import type { PlanPatch } from "../lib/ai/types";

/**
 * Deterministic patch list for `applyPlanPatches`:
 * - Last patch per `sessionId` in input order wins (preview + confirm safe).
 * - Output sorted by `sessionId` so Map/apply order cannot drift between calls.
 */
export function normalizePlanPatchesForApply(patches: PlanPatch[]): PlanPatch[] {
  if (!patches.length) return [];
  const lastById = new Map<string, PlanPatch>();
  for (const p of patches) {
    if (!p || typeof p.sessionId !== "string" || !p.sessionId.trim()) continue;
    const id = p.sessionId.trim();
    lastById.set(id, { ...p, sessionId: id });
  }
  return Array.from(lastById.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}
