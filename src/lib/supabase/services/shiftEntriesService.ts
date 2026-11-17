import { supabase } from "../client";
import { isMissingSchemaError } from "../schemaErrors";

/** Schicht-Modus (Migration 023, docs/readiness-spec.md §7.6). */
export type ShiftEntryKind = "early" | "late" | "night" | "off" | "custom";

export const SHIFT_ENTRY_KINDS: readonly ShiftEntryKind[] = ["early", "late", "night", "off", "custom"];

/** Ein Dienstplan-Tag in der App: `dateYmd` = Tag des Dienstbeginns; Zeiten `HH:MM`, bei `off` beide `null`. */
export type StoredShiftEntry = {
  dateYmd: string;
  kind: ShiftEntryKind;
  start: string | null;
  end: string | null;
  label: string | null;
};

/** Mirrors `public.shift_entries` (Migration 023). */
export type DbShiftEntryRow = {
  id?: string;
  user_id: string;
  shift_date: string;
  kind: string;
  start_time: string | null;
  end_time: string | null;
  label: string | null;
  created_at?: string;
  updated_at?: string;
};

/** `unavailable` = Tabelle fehlt (Migration 023 noch nicht angewendet); `error` = alles andere (offline, RLS …). */
export type ShiftServiceResult<T> = { status: "ok"; value: T } | { status: "unavailable" } | { status: "error"; message: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "06:00:00" (Postgres `time`) oder "6:00" → "06:00"; `null` bei ungültig. */
export function normalizeShiftTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isKind(value: unknown): value is ShiftEntryKind {
  return typeof value === "string" && (SHIFT_ENTRY_KINDS as readonly string[]).indexOf(value) >= 0;
}

/** Zeile → App-Eintrag; `null`, wenn die Zeile nicht zur Form passt (statt eines halben Eintrags). */
export function dbRowToShiftEntry(row: DbShiftEntryRow): StoredShiftEntry | null {
  const dateYmd = typeof row.shift_date === "string" ? row.shift_date.slice(0, 10) : "";
  if (!YMD.test(dateYmd) || !isKind(row.kind)) return null;
  if (row.kind === "off") return { dateYmd, kind: "off", start: null, end: null, label: row.label ?? null };
  const start = normalizeShiftTime(row.start_time);
  const end = normalizeShiftTime(row.end_time);
  if (!start || !end) return null;
  return { dateYmd, kind: row.kind, start, end, label: row.label ?? null };
}

/** App-Eintrag → Upsert-Zeile; `null`, wenn er die CHECK-Regel der Tabelle verletzen würde. */
export function shiftEntryToRow(userId: string, entry: StoredShiftEntry): DbShiftEntryRow | null {
  if (!YMD.test(entry.dateYmd) || !isKind(entry.kind)) return null;
  if (entry.kind === "off") {
    return { user_id: userId, shift_date: entry.dateYmd, kind: "off", start_time: null, end_time: null, label: entry.label ?? null };
  }
  const start = normalizeShiftTime(entry.start);
  const end = normalizeShiftTime(entry.end);
  if (!start || !end) return null;
  return { user_id: userId, shift_date: entry.dateYmd, kind: entry.kind, start_time: start, end_time: end, label: entry.label ?? null };
}

function failure<T>(error: unknown, where: string): ShiftServiceResult<T> {
  if (isMissingSchemaError(error)) return { status: "unavailable" };
  const message = error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "unknown";
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn(`[shiftEntriesService] ${where}`, message);
  }
  return { status: "error", message };
}

/** Einträge von `fromYmd` bis `toYmd` (inklusive), aufsteigend. */
export async function loadShiftEntries(userId: string, fromYmd: string, toYmd: string): Promise<ShiftServiceResult<StoredShiftEntry[]>> {
  try {
    const { data, error } = await supabase
      .from("shift_entries")
      .select("shift_date, kind, start_time, end_time, label")
      .eq("user_id", userId)
      .gte("shift_date", fromYmd)
      .lte("shift_date", toYmd)
      .order("shift_date", { ascending: true });
    if (error) return failure(error, "loadShiftEntries");
    const out: StoredShiftEntry[] = [];
    ((Array.isArray(data) ? data : []) as DbShiftEntryRow[]).forEach((row) => {
      const entry = dbRowToShiftEntry(row);
      if (entry) out.push(entry);
    });
    return { status: "ok", value: out };
  } catch (error) {
    return failure(error, "loadShiftEntries");
  }
}

/** Ein Bulk-Upsert über (`user_id`, `shift_date`): ein Tag hat höchstens einen Eintrag. Ungültige Einträge fallen weg. */
export async function upsertShiftEntries(userId: string, entries: StoredShiftEntry[]): Promise<ShiftServiceResult<number>> {
  const byDate: Record<string, DbShiftEntryRow> = {};
  entries.forEach((entry) => {
    const row = shiftEntryToRow(userId, entry);
    if (row) byDate[row.shift_date] = row;
  });
  const rows = Object.keys(byDate)
    .sort()
    .map((date) => byDate[date]);
  if (rows.length === 0) return { status: "ok", value: 0 };
  try {
    const { error } = await supabase.from("shift_entries").upsert(rows, { onConflict: "user_id,shift_date" });
    if (error) return failure(error, "upsertShiftEntries");
    return { status: "ok", value: rows.length };
  } catch (error) {
    return failure(error, "upsertShiftEntries");
  }
}

/** Löscht die Einträge der angegebenen Tage (Tag ohne Dienstplan-Angabe = „keine Aussage“). */
export async function deleteShiftEntries(userId: string, dates: string[]): Promise<ShiftServiceResult<number>> {
  const valid = dates.filter((d) => YMD.test(d));
  if (valid.length === 0) return { status: "ok", value: 0 };
  try {
    const { error } = await supabase.from("shift_entries").delete().eq("user_id", userId).in("shift_date", valid);
    if (error) return failure(error, "deleteShiftEntries");
    return { status: "ok", value: valid.length };
  } catch (error) {
    return failure(error, "deleteShiftEntries");
  }
}
