import type { PlanPatch } from "../../../lib/ai/types";
import { supabase } from "../client";

type PlanPatchRow = {
  session_id: string;
  changes: unknown;
  reason: string | null;
};

export async function loadPlanPatches(userId: string): Promise<PlanPatch[] | null> {
  const { data, error } = await supabase
    .from("plan_patches")
    .select("session_id, changes, reason")
    .eq("user_id", userId)
    .order("applied_at", { ascending: true });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[planPatchesService] loadPlanPatches", error.message);
    }
    return null;
  }

  if (!data || !Array.isArray(data)) return [];

  const out: PlanPatch[] = [];
  for (const row of data as PlanPatchRow[]) {
    if (typeof row.session_id !== "string" || !row.session_id.trim()) continue;
    const changes =
      row.changes != null && typeof row.changes === "object" && !Array.isArray(row.changes)
        ? (row.changes as PlanPatch["changes"])
        : {};
    const patch: PlanPatch = {
      sessionId: row.session_id.trim(),
      changes,
    };
    if (row.reason != null && row.reason !== "") {
      patch.reason = row.reason;
    }
    out.push(patch);
  }
  return out;
}

export async function savePlanPatch(userId: string, patch: PlanPatch): Promise<void> {
  const sessionId = typeof patch.sessionId === "string" ? patch.sessionId.trim() : "";
  if (!sessionId) return;

  const { error } = await supabase.from("plan_patches").insert({
    user_id: userId,
    session_id: sessionId,
    changes: patch.changes ?? {},
    reason: patch.reason ?? null,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[planPatchesService] savePlanPatch", error.message);
    }
  }
}
