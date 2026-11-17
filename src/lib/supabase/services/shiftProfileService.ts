/**
 * Schicht-Felder des Profils (`profiles.works_shifts`, `profiles.shift_defaults`, Migration 023).
 * Eigene Datei statt `profilesService.ts`, damit parallele Änderungen am Profil-Service konfliktfrei bleiben;
 * gleiche Tabelle, gleiches Upsert-Muster (`onConflict: "user_id"`) wie `saveProfile`/`saveHealthConsent`.
 */
import { supabase } from "../client";
import { isMissingSchemaError } from "../schemaErrors";

/** Eigene Standardzeiten der Schicht-Chips. */
export type ShiftDefaultTimes = Partial<Record<"early" | "late" | "night", { start: string; end: string }>>;

export type ShiftProfile = {
  /** `null` = noch nicht gefragt. */
  worksShifts: boolean | null;
  defaults: ShiftDefaultTimes | null;
};

export type ShiftProfileResult = { status: "ok"; value: ShiftProfile } | { status: "unavailable" } | { status: "error" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Nur gültige `HH:MM`-Paare der drei Chips übernehmen; alles andere (auch fremde jsonb-Formen) fällt weg. */
export function sanitizeShiftDefaults(raw: unknown): ShiftDefaultTimes | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ShiftDefaultTimes = {};
  (["early", "late", "night"] as const).forEach((kind) => {
    const value = (raw as Record<string, unknown>)[kind];
    if (!value || typeof value !== "object") return;
    const { start, end } = value as { start?: unknown; end?: unknown };
    if (typeof start === "string" && typeof end === "string" && HHMM.test(start) && HHMM.test(end) && start !== end) {
      out[kind] = { start, end };
    }
  });
  return Object.keys(out).length > 0 ? out : null;
}

/** Fehlen die Spalten (Migration 023 nicht angewendet) → `unavailable`; der Aufrufer fällt dann auf lokal zurück. */
export async function loadShiftProfile(userId: string): Promise<ShiftProfileResult> {
  try {
    const { data, error } = await supabase.from("profiles").select("works_shifts, shift_defaults").eq("user_id", userId).maybeSingle();
    if (error) return isMissingSchemaError(error) ? { status: "unavailable" } : { status: "error" };
    const row = (data ?? null) as { works_shifts?: unknown; shift_defaults?: unknown } | null;
    return {
      status: "ok",
      value: {
        worksShifts: typeof row?.works_shifts === "boolean" ? row.works_shifts : null,
        defaults: sanitizeShiftDefaults(row?.shift_defaults),
      },
    };
  } catch {
    return { status: "error" };
  }
}

/** Speichert nur die übergebenen Felder; andere Profil-Spalten bleiben unberührt (Upsert legt die Zeile notfalls an). */
export async function saveShiftProfile(
  userId: string,
  patch: { worksShifts?: boolean | null; defaults?: ShiftDefaultTimes | null },
): Promise<"ok" | "unavailable" | "error"> {
  const row: Record<string, unknown> = { user_id: userId };
  if (patch.worksShifts !== undefined) row.works_shifts = patch.worksShifts;
  if (patch.defaults !== undefined) row.shift_defaults = patch.defaults;
  if (Object.keys(row).length === 1) return "ok";
  try {
    const { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });
    if (!error) return "ok";
    return isMissingSchemaError(error) ? "unavailable" : "error";
  } catch {
    return "error";
  }
}
