import type { PostgrestError } from "@supabase/supabase-js";
import type { SessionLog } from "../../../marathonPrediction";
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

function dbRowToSessionLog(row: DbSessionLog): SessionLog {
  const log: SessionLog = {};
  if (row.feeling != null && Number.isFinite(row.feeling)) log.feeling = row.feeling;
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

async function upsertSessionLogViaSelectInsertUpdate(
  row: ReturnType<typeof sessionLogToUpsertPayload>,
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
  const upsertResult = await supabase
    .from("session_logs")
    .upsert(row, { onConflict: SESSION_LOGS_ON_CONFLICT });

  let data: unknown = upsertResult.data;
  let error: PostgrestError | null = upsertResult.error;

  if (error?.code === PG_NO_MATCHING_UNIQUE_CONSTRAINT) {
    const fallback = await upsertSessionLogViaSelectInsertUpdate(row);
    data = fallback.data;
    error = fallback.error;
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
