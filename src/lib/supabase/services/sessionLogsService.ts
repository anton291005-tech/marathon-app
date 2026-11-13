import type { PostgrestError } from "@supabase/supabase-js";
import type { SessionLog } from "../../../marathonPrediction";
import { isRpeSource } from "../../../sessionLogs/rpeSource";
import { supabase } from "../client";

export type SessionLogUpsertResult = {
  data: unknown;
  error: PostgrestError | null;
  row: ReturnType<typeof sessionLogToUpsertPayload>;
};

/** Mirrors `public.session_logs` (Supabase / Postgres). */
export type DbSessionLog = {
  id: string;
  user_id: string;
  session_id: string;
  completed: boolean | null;
  skipped: boolean | null;
  feeling: number | null;
  /** Migration 016; fehlt vor dem Anwenden. */
  rpe?: number | null;
  /** Migration 021; fehlt vor dem Anwenden. */
  rpe_source?: string | null;
  duration_min?: number | null;
  actual_distance_meters: number | null;
  notes: string | null;
  assigned_run: unknown | null;
  run_evaluation: unknown | null;
  logged_at: string | null;
  created_at: string;
};

function actualKmToMeters(actualKm: string | undefined): number | null {
  if (actualKm == null || String(actualKm).trim() === "") return null;
  const n = parseFloat(String(actualKm).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n * 1000;
}

function metersToActualKmKmString(meters: number | null): string | undefined {
  if (meters == null || !Number.isFinite(meters)) return undefined;
  const km = meters / 1000;
  return String(km);
}

/** Session-RPE 0–10 als ganze Zahl, sonst `null`. */
export function normalizeRpe(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return Math.round(n);
}

/**
 * Dauer in Minuten (5–600): zuerst aus dem aktuell zugeordneten Health-Lauf (Sekunden), sonst ein ausdrücklich
 * eingetragener Wert. `duration_min` aus der Datenbank wird bewusst nicht ins lokale Log geladen: Sonst würde nach
 * dem Lösen oder Wechseln eines Laufs die alte Dauer erneut gespeichert.
 */
export function sessionDurationMin(log: SessionLog): number | null {
  const raw =
    typeof log.assignedRun?.duration === "number"
      ? log.assignedRun.duration / 60
      : typeof log.durationMin === "number"
        ? log.durationMin
        : NaN;
  if (!Number.isFinite(raw)) return null;
  const minutes = Math.round(raw);
  return minutes >= 5 && minutes <= 600 ? minutes : null;
}

function dbRowToSessionLog(row: DbSessionLog): SessionLog {
  const log: SessionLog = {};
  if (row.feeling != null && Number.isFinite(row.feeling)) log.feeling = row.feeling;
  const rpe = normalizeRpe(row.rpe);
  if (rpe != null) {
    log.rpe = rpe;
    if (isRpeSource(row.rpe_source)) log.rpeSource = row.rpe_source;
  }
  const ak = metersToActualKmKmString(row.actual_distance_meters);
  if (ak !== undefined) log.actualKm = ak;
  if (row.notes != null && row.notes !== "") log.notes = row.notes;
  if (row.completed === true || row.completed === false) log.done = row.completed;
  if (row.skipped === true || row.skipped === false) log.skipped = row.skipped;
  if (row.logged_at) log.at = row.logged_at;
  if (row.assigned_run != null && typeof row.assigned_run === "object" && !Array.isArray(row.assigned_run)) {
    log.assignedRun = row.assigned_run as NonNullable<SessionLog["assignedRun"]>;
  }
  if (row.run_evaluation != null && typeof row.run_evaluation === "object" && !Array.isArray(row.run_evaluation)) {
    log.runEvaluation = row.run_evaluation as NonNullable<SessionLog["runEvaluation"]>;
  }
  return log;
}

function sessionLogToUpsertPayload(args: { userId: string; sessionId: string; log: SessionLog }) {
  return {
    user_id: args.userId,
    session_id: args.sessionId,
    completed: args.log.done ?? null,
    skipped: args.log.skipped ?? null,
    feeling: args.log.feeling ?? null,
    rpe: normalizeRpe(args.log.rpe),
    rpe_source: normalizeRpe(args.log.rpe) != null && isRpeSource(args.log.rpeSource) ? args.log.rpeSource : null,
    duration_min: sessionDurationMin(args.log),
    actual_distance_meters: actualKmToMeters(args.log.actualKm),
    notes: args.log.notes ?? null,
    assigned_run: args.log.assignedRun != null ? args.log.assignedRun : null,
    run_evaluation: args.log.runEvaluation != null ? args.log.runEvaluation : null,
    logged_at: args.log.at ?? null,
  };
}

export async function loadSessionLogs(userId: string): Promise<Record<string, SessionLog> | null> {
  const { data, error } = await supabase.from("session_logs").select("*").eq("user_id", userId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[sessionLogsService] loadSessionLogs", error.message);
    }
    return null;
  }

  if (!data || !Array.isArray(data)) return {};

  const out: Record<string, SessionLog> = {};
  for (const raw of data as DbSessionLog[]) {
    const sid = raw?.session_id;
    if (typeof sid !== "string" || !sid.trim()) continue;
    out[sid] = dbRowToSessionLog(raw);
  }
  return out;
}

const SESSION_LOGS_ON_CONFLICT = "user_id,session_id" as const;

/** Postgres: no unique/exclusion constraint for ON CONFLICT (constraint not deployed yet). */
const PG_NO_MATCHING_UNIQUE_CONSTRAINT = "42P10";

/** PostgREST: Spalte unbekannt (Migration 016 noch nicht angewendet). */
const PGRST_UNKNOWN_COLUMN = "PGRST204";

function missingColumnText(error: PostgrestError | null): string | null {
  if (!error || (error.code !== PGRST_UNKNOWN_COLUMN && error.code !== "42703")) return null;
  return `${error.message ?? ""} ${error.details ?? ""}`;
}

function isMissingRpeColumns(error: PostgrestError | null): boolean {
  const text = missingColumnText(error);
  return text != null && /\b(rpe|duration_min)\b/.test(text);
}

/** Migration 021 (`rpe_source`) fehlt: nur diese Spalte weglassen, `rpe` aus Migration 016 bleibt. */
function isMissingRpeSourceColumn(error: PostgrestError | null): boolean {
  const text = missingColumnText(error);
  return text != null && /\brpe_source\b/.test(text);
}

/** Merkt sich pro App-Lauf, dass `rpe_source` auf dem Server fehlt — dann gibt es keinen Fehlversuch pro Speichern. */
let rpeSourceColumnMissing = false;

/** Nur für Tests. */
export function resetRpeSourceColumnMemo(): void {
  rpeSourceColumnMissing = false;
}

type UpsertRow = ReturnType<typeof sessionLogToUpsertPayload>;
type RowWithoutRpeSource = Omit<UpsertRow, "rpe_source">;
type RowWithoutRpeColumns = Omit<UpsertRow, "rpe" | "rpe_source" | "duration_min">;
type AnyRow = UpsertRow | RowWithoutRpeSource | RowWithoutRpeColumns;

function withoutRpeSource(row: UpsertRow): RowWithoutRpeSource {
  const { rpe_source: _rpeSource, ...rest } = row;
  void _rpeSource;
  return rest;
}

/** Zeile ohne die Spalten aus Migration 016/021 — damit das Abhaken ohne die Migration weiter funktioniert. */
function withoutRpeColumns(row: UpsertRow): RowWithoutRpeColumns {
  const { rpe: _rpe, rpe_source: _rpeSource, duration_min: _durationMin, ...rest } = row;
  void _rpe;
  void _rpeSource;
  void _durationMin;
  return rest;
}

async function upsertSessionLogViaSelectInsertUpdate(
  row: AnyRow,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  const { data: existing, error: selectError } = await supabase
    .from("session_logs")
    .select("id")
    .eq("user_id", row.user_id)
    .eq("session_id", row.session_id)
    .maybeSingle();

  if (selectError) return { data: null, error: selectError };

  if (existing?.id) {
    const { data, error } = await supabase.from("session_logs").update(row).eq("id", existing.id);
    return { data, error };
  }

  const { data, error } = await supabase.from("session_logs").insert(row);
  return { data, error };
}

/** Full Supabase upsert result — use in migration to detect RLS / constraint failures. */
export async function upsertSessionLogWithResult(
  userId: string,
  sessionId: string,
  log: SessionLog,
): Promise<SessionLogUpsertResult> {
  const row = sessionLogToUpsertPayload({ userId, sessionId, log });
  const write = async (payload: AnyRow) => {
    const upsertResult = await supabase.from("session_logs").upsert(payload, { onConflict: SESSION_LOGS_ON_CONFLICT });
    if (upsertResult.error?.code === PG_NO_MATCHING_UNIQUE_CONSTRAINT) {
      return upsertSessionLogViaSelectInsertUpdate(payload);
    }
    return { data: upsertResult.data as unknown, error: upsertResult.error };
  };

  let { data, error } = await write(rpeSourceColumnMissing ? withoutRpeSource(row) : row);
  if (!rpeSourceColumnMissing && isMissingRpeSourceColumn(error)) {
    rpeSourceColumnMissing = true;
    ({ data, error } = await write(withoutRpeSource(row)));
  }
  if (isMissingRpeColumns(error)) {
    ({ data, error } = await write(withoutRpeColumns(row)));
  }

  return { data, error, row };
}

export async function saveSessionLog(userId: string, sessionId: string, log: SessionLog): Promise<void> {
  const { error } = await upsertSessionLogWithResult(userId, sessionId, log);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[sessionLogsService] saveSessionLog", error.message);
    }
  }
}
