import type { StoredHealthRun } from "../../../healthRuns";
import { dedupeAppleHealthAndStravaRuns } from "../../../strava/crossSourceRunDedup";
import { isStravaRunId, STRAVA_SOURCE_NAME, STRAVA_SOURCE_PREFIX } from "../../../strava/stravaRunSource";
import { supabase } from "../client";

/** Row shape for `public.health_workouts` SELECT * (relevant columns). */
export type DbHealthWorkoutRow = {
  id: string;
  user_id: string;
  source_id: string;
  workout_type: string | null;
  start_time: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_heart_rate: number | null;
  calories: number | null;
  splits: unknown | null;
  laps: unknown | null;
  gps_stream: unknown | null;
  interval_snapshot: unknown | null;
  created_at: string;
};

export function dbRowToStoredHealthRun(row: DbHealthWorkoutRow): StoredHealthRun | null {
  if (typeof row.source_id !== "string" || !row.source_id.trim()) return null;
  if (!row.start_time || String(row.start_time).trim() === "") return null;
  const distanceMeters =
    row.distance_meters != null && Number.isFinite(Number(row.distance_meters)) ? Number(row.distance_meters) : null;
  const distanceUnknown = distanceMeters == null;

  const run: StoredHealthRun = {
    runId: row.source_id.trim(),
    startDate: String(row.start_time),
    duration: row.duration_seconds != null && Number.isFinite(row.duration_seconds) ? Math.round(row.duration_seconds) : 0,
    distanceMeters,
    distanceUnknown,
    splits: row.splits != null ? (row.splits as StoredHealthRun["splits"]) : undefined,
    laps: row.laps != null ? (row.laps as StoredHealthRun["laps"]) : undefined,
    gpsStream: row.gps_stream != null ? (row.gps_stream as StoredHealthRun["gpsStream"]) : undefined,
    intervalIntensitySnapshot:
      row.interval_snapshot != null && typeof row.interval_snapshot === "object" && !Array.isArray(row.interval_snapshot)
        ? (row.interval_snapshot as StoredHealthRun["intervalIntensitySnapshot"])
        : undefined,
  };

  if (row.workout_type != null && row.workout_type !== "") run.workoutType = row.workout_type;
  if (row.avg_heart_rate != null && Number.isFinite(row.avg_heart_rate)) {
    run.avgHeartRateBpm = Math.round(Number(row.avg_heart_rate));
  }
  if (row.calories != null && Number.isFinite(Number(row.calories)) && Number(row.calories) > 0) {
    run.calories = Math.round(Number(row.calories));
  }
  // Die Tabelle hat keine Quellspalte: Strava-Zeilen erkennt man am source_id-Präfix.
  if (isStravaRunId(run.runId)) run.sourceName = STRAVA_SOURCE_NAME;

  return run;
}

function storedRunToUpsertPayload(userId: string, run: StoredHealthRun) {
  const sourceId = typeof run.runId === "string" ? run.runId.trim() : "";
  const distanceMeters =
    run.distanceUnknown || run.distanceMeters == null || !Number.isFinite(Number(run.distanceMeters))
      ? null
      : Number(run.distanceMeters);

  return {
    user_id: userId,
    source_id: sourceId,
    workout_type: run.workoutType ?? null,
    start_time: run.startDate ? run.startDate : null,
    duration_seconds: run.duration != null && Number.isFinite(run.duration) ? Math.round(run.duration) : null,
    distance_meters: distanceMeters,
    avg_heart_rate:
      run.avgHeartRateBpm != null && Number.isFinite(run.avgHeartRateBpm) ? Math.round(run.avgHeartRateBpm) : null,
    // Nur mitschicken, wenn bekannt: ein `null` würde beim Upsert einen vorhandenen Wert überschreiben.
    ...(typeof run.calories === "number" && Number.isFinite(run.calories) ? { calories: Math.round(run.calories) } : {}),
    splits: run.splits != null ? run.splits : null,
    laps: run.laps != null ? run.laps : null,
    gps_stream: run.gpsStream != null ? run.gpsStream : null,
    interval_snapshot: run.intervalIntensitySnapshot != null ? run.intervalIntensitySnapshot : null,
  };
}

export async function loadHealthWorkouts(userId: string): Promise<StoredHealthRun[] | null> {
  const { data, error } = await supabase.from("health_workouts").select("*").eq("user_id", userId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[healthWorkoutsService] loadHealthWorkouts", error.message);
    }
    return null;
  }

  if (!data || !Array.isArray(data)) return [];

  const out: StoredHealthRun[] = [];
  for (const raw of data as DbHealthWorkoutRow[]) {
    const mapped = dbRowToStoredHealthRun(raw);
    if (mapped) out.push(mapped);
  }
  return dedupeAppleHealthAndStravaRuns(out);
}

/** Nur die importierten Strava-Läufe (nach POST /api/strava/sync), ohne Deduplizierung. */
export async function loadStravaHealthWorkouts(userId: string): Promise<StoredHealthRun[] | null> {
  const { data, error } = await supabase
    .from("health_workouts")
    .select("*")
    .eq("user_id", userId)
    .like("source_id", `${STRAVA_SOURCE_PREFIX}%`);
  if (error) {
    console.warn("[healthWorkoutsService] loadStravaHealthWorkouts", error.message);
    return null;
  }
  if (!data || !Array.isArray(data)) return [];
  const out: StoredHealthRun[] = [];
  for (const raw of data as DbHealthWorkoutRow[]) {
    const mapped = dbRowToStoredHealthRun(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function saveHealthWorkout(userId: string, run: StoredHealthRun): Promise<void> {
  if (!run?.runId || !String(run.runId).trim()) return;
  // Strava-Zeilen schreibt nur der Server (`api/strava/sync.js`); der Client würde sonst nach dem
  // 7-Tage-Aufräumen (Strava API Policy §6.2) gelöschte Zeilen wieder anlegen.
  if (isStravaRunId(run.runId)) return;

  const row = storedRunToUpsertPayload(userId, run);
  const { error } = await supabase.from("health_workouts").upsert(row, { onConflict: "user_id,source_id" });

  if (error) {
    // Auch im Release sichtbar: ein fehlgeschlagener Upsert heißt, das Workout fehlt auf anderen Geräten.
    console.warn("[healthWorkoutsService] saveHealthWorkout", error.message);
  }
}

/**
 * Löscht alle importierten Strava-Läufe des Nutzers (beim Trennen; Strava API Policy §7.4 verlangt das
 * Löschen nach Widerruf). Geplante Einheiten, die schon als erledigt gelten, bleiben erledigt.
 */
export async function deleteStravaHealthWorkouts(userId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("health_workouts")
    .delete()
    .eq("user_id", userId)
    .like("source_id", `${STRAVA_SOURCE_PREFIX}%`);
  if (error) {
    console.warn("[healthWorkoutsService] deleteStravaHealthWorkouts", error.message);
    return { ok: false };
  }
  return { ok: true };
}
