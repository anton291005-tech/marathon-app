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

/**
 * Löscht ALLE Patches des Nutzers in Supabase. `plan_patches` hat keinen Plan-Bezug, Session-IDs
 * (`w5-mo`) wiederholen sich zwischen Plänen — nach einem Planwechsel würden alte Zeilen beim nächsten
 * Laden auf den neuen Plan wirken. Wirft nie: bei Fehler (z. B. offline) nur `console.warn`, kein Retry;
 * die Zeilen bleiben dann stehen und kommen beim nächsten App-Start zurück.
 */
export async function deleteAllPlanPatches(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("plan_patches").delete().eq("user_id", userId);
    if (!error) return true;
    // eslint-disable-next-line no-console
    console.warn("[planPatchesService] deleteAllPlanPatches", error.message);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[planPatchesService] deleteAllPlanPatches", e);
  }
  return false;
}

/** So lange wartet ein Planwechsel höchstens auf den DELETE (hängende Verbindung), danach geht es ohne ihn weiter. */
export const PLAN_PATCHES_DELETE_TIMEOUT_MS = 5000;

/**
 * Verwirft die Patches, wenn ein anderer Plan aktiv wird (Onboarding-Abschluss, Plan-Ersatz, Planwechsel,
 * Löschen des aktiven Plans): lokal sofort, danach in Supabase. Das Promise ist erst erfüllt, wenn der
 * DELETE durch ist — wer danach neue Patches speichert (Wizard), wartet darauf, sonst träfe der DELETE sie mit.
 * Ohne Planwechsel (`activePlanChanged: false`, z. B. ein nicht aktiver Plan wurde gelöscht) passiert nichts.
 * Antwortet der DELETE nicht binnen `PLAN_PATCHES_DELETE_TIMEOUT_MS`, geht es mit `console.warn` weiter; die
 * Anfrage selbst wird nicht abgebrochen und kann später noch durchgehen.
 */
export async function clearPlanPatchesForPlanChange(args: {
  activePlanChanged: boolean;
  userId: string | null | undefined;
  clearLocal: () => void;
  deleteRemote?: (userId: string) => Promise<boolean>;
}): Promise<void> {
  if (!args.activePlanChanged) return;
  args.clearLocal();
  if (!args.userId) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), PLAN_PATCHES_DELETE_TIMEOUT_MS);
  });
  const outcome = await Promise.race([(args.deleteRemote ?? deleteAllPlanPatches)(args.userId), timedOut]);
  clearTimeout(timer);
  if (outcome === "timeout") {
    // eslint-disable-next-line no-console
    console.warn(`[planPatchesService] deleteAllPlanPatches: keine Antwort nach ${PLAN_PATCHES_DELETE_TIMEOUT_MS} ms, weiter ohne Bestätigung`);
  }
}
