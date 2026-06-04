import type { PlanPatch } from "../lib/ai/types";

function trimPatchId(p: PlanPatch): string | null {
  if (!p || typeof p.sessionId !== "string" || !p.sessionId.trim()) return null;
  return p.sessionId.trim();
}

/**
 * Merge persisted AI patches with an incoming batch (e.g. coach confirm).
 * **Order**: keys first appear in `prev` order, then new keys from `incoming` in order.
 * Last write per `sessionId` wins. Does **not** sort — keeps `JSON.stringify(aiPlanPatches)` stable for recovery version hashing.
 */
export function mergePlanPatchLists(prev: PlanPatch[] | undefined | null, incoming: PlanPatch[]): PlanPatch[] {
  const a = Array.isArray(prev) ? prev : [];
  const b = Array.isArray(incoming) ? incoming : [];

  const byId = new Map<string, PlanPatch>();
  for (const p of a) {
    const id = trimPatchId(p);
    if (!id) continue;
    byId.set(id, { ...p, sessionId: id });
  }
  for (const p of b) {
    const id = trimPatchId(p);
    if (!id) continue;
    byId.set(id, { ...p, sessionId: id });
  }

  const out: PlanPatch[] = [];
  const seen = new Set<string>();
  for (const p of a) {
    const id = trimPatchId(p);
    if (!id || seen.has(id)) continue;
    const merged = byId.get(id);
    if (merged) {
      out.push(merged);
      seen.add(id);
    }
  }
  for (const p of b) {
    const id = trimPatchId(p);
    if (!id || seen.has(id)) continue;
    const merged = byId.get(id);
    if (merged) {
      out.push(merged);
      seen.add(id);
    }
  }
  return out;
}
