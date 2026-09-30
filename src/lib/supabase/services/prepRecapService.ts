import type { PrepRecapStats } from "../../../prepRecap/buildPrepRecapSnapshot";
import type { FinishTimePatch, FinishTimeSource, PrepRecapRecord } from "../../../prepRecap/prepRecapRecord";
import { supabase } from "../client";

const TABLE = "prep_recaps";

/** Row shape for `public.prep_recaps`. */
export type DbPrepRecapRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  race_name: string | null;
  race_date: string;
  finish_time_seconds: number | null;
  finish_time_source: string | null;
  finish_time_confirmed: boolean | null;
  schema_version: number;
  stats: unknown;
  created_at: string;
  updated_at: string;
};

function warnDev(fn: string, message: string): void {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn(`[prepRecapService] ${fn}`, message);
  }
}

export function dbRowToPrepRecap(row: DbPrepRecapRow): PrepRecapRecord | null {
  if (!row || typeof row.race_date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(row.race_date)) return null;
  if (!row.stats || typeof row.stats !== "object" || Array.isArray(row.stats)) return null;
  const seconds =
    row.finish_time_seconds != null && Number.isFinite(Number(row.finish_time_seconds)) && Number(row.finish_time_seconds) > 0
      ? Math.round(Number(row.finish_time_seconds))
      : null;
  const source: FinishTimeSource | null =
    seconds != null && (row.finish_time_source === "health" || row.finish_time_source === "manual")
      ? row.finish_time_source
      : null;
  return {
    id: row.id,
    planId: row.plan_id ?? null,
    raceName: row.race_name ?? null,
    raceDate: row.race_date.slice(0, 10),
    finishTimeSeconds: seconds,
    finishTimeSource: source,
    finishTimeConfirmed: seconds != null && row.finish_time_confirmed === true,
    schemaVersion: Number.isFinite(Number(row.schema_version)) ? Number(row.schema_version) : 0,
    stats: row.stats as PrepRecapStats,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function prepRecapToInsertPayload(userId: string, record: PrepRecapRecord) {
  return {
    user_id: userId,
    plan_id: record.planId,
    race_name: record.raceName,
    race_date: record.raceDate,
    finish_time_seconds: record.finishTimeSeconds,
    finish_time_source: record.finishTimeSeconds != null ? record.finishTimeSource : null,
    finish_time_confirmed: record.finishTimeSeconds != null ? record.finishTimeConfirmed : false,
    schema_version: record.schemaVersion,
    stats: record.stats,
  };
}

/** Alle Rückblicke des Nutzers, neueste zuerst; null bei Fehler (z. B. Tabelle fehlt). */
export async function loadPrepRecaps(userId: string): Promise<PrepRecapRecord[] | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("race_date", { ascending: false });
  if (error) {
    warnDev("loadPrepRecaps", error.message);
    return null;
  }
  if (!Array.isArray(data)) return [];
  const out: PrepRecapRecord[] = [];
  for (const row of data as DbPrepRecapRow[]) {
    const mapped = dbRowToPrepRecap(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Legt den Snapshot an, falls für diesen Renntag noch keiner existiert (ignoreDuplicates —
 * ein bestehender Snapshot wird nie überschrieben). Liefert die tatsächlich gespeicherte Zeile.
 */
export async function insertPrepRecapIfAbsent(
  userId: string,
  record: PrepRecapRecord,
): Promise<PrepRecapRecord | null> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(prepRecapToInsertPayload(userId, record), { onConflict: "user_id,race_date", ignoreDuplicates: true });
  if (error) {
    warnDev("insertPrepRecapIfAbsent", error.message);
    return null;
  }
  const { data, error: readError } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("race_date", record.raceDate)
    .maybeSingle();
  if (readError || !data) {
    if (readError) warnDev("insertPrepRecapIfAbsent/read", readError.message);
    return null;
  }
  return dbRowToPrepRecap(data as DbPrepRecapRow);
}

/** Überschreibt nur Stats + schema_version (Zeitfelder bleiben unangetastet). */
export async function updatePrepRecapStats(
  userId: string,
  raceDate: string,
  stats: PrepRecapStats,
  schemaVersion: number,
): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE)
    .update({ stats, schema_version: schemaVersion })
    .eq("user_id", userId)
    .eq("race_date", raceDate);
  if (error) {
    warnDev("updatePrepRecapStats", error.message);
    return false;
  }
  return true;
}

/**
 * Setzt die Zielzeit. `onlyIfEmpty` (Health-Nachtrag) schreibt nur, wenn noch keine Zeit gespeichert
 * ist — der Filter sitzt in der DB-Abfrage, damit eine inzwischen bestätigte Zeit nie überschrieben wird.
 */
export async function updatePrepRecapFinishTime(
  userId: string,
  raceDate: string,
  finish: FinishTimePatch,
  opts: { onlyIfEmpty?: boolean } = {},
): Promise<boolean> {
  let query = supabase
    .from(TABLE)
    .update({
      finish_time_seconds: Math.round(finish.seconds),
      finish_time_source: finish.source,
      finish_time_confirmed: finish.confirmed,
    })
    .eq("user_id", userId)
    .eq("race_date", raceDate);
  if (opts.onlyIfEmpty) query = query.is("finish_time_seconds", null);
  const { error } = await query;
  if (error) {
    warnDev("updatePrepRecapFinishTime", error.message);
    return false;
  }
  return true;
}

/**
 * Verknüpft den Rückblick eines Renntags mit dem Plan, der gleich archiviert wird — darüber findet
 * „Meine Trainingspläne" den Rückblick zum archivierten Plan wieder. true nur, wenn eine Zeile
 * tatsächlich geändert wurde (ein Update ohne Treffer ist in Postgres kein Fehler).
 */
export async function linkPrepRecapToPlan(userId: string, raceDate: string, planId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ plan_id: planId })
    .eq("user_id", userId)
    .eq("race_date", raceDate)
    .select("id");
  if (error) {
    warnDev("linkPrepRecapToPlan", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
