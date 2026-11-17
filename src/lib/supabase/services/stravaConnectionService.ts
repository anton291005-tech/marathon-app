import { supabase } from "../client";
import { deleteStravaHealthWorkouts } from "./healthWorkoutsService";

/**
 * Verbindungsstatus + Trennen für `strava_connections` (Muster: weeklyScheduleBlocksService.ts).
 * Kein Live-Check gegen die Strava-API: eine bestehende Row gilt hier immer als "verbunden",
 * auch wenn der Token extern (auf Strava-Seite) bereits widerrufen wurde — bekannte v1-Limitation,
 * kein Fix in Settings-Schritt 4b, siehe docs/roadmap.md.
 */

export type StravaConnectionRow = { strava_athlete_id?: number | null } | null;

/** Reine Ableitung — verbunden heißt: eine Row mit gesetzter strava_athlete_id existiert. */
export function deriveStravaConnected(row: StravaConnectionRow): boolean {
  return Boolean(row?.strava_athlete_id);
}

export async function fetchStravaConnectionStatus(): Promise<boolean> {
  const { data, error } = await supabase
    .from("strava_connections")
    .select("strava_athlete_id")
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Strava] connection status check failed", error);
    return false;
  }
  return deriveStravaConnected(data);
}

/**
 * Löscht die Connection-Row und die importierten Strava-Läufe (`health_workouts`, `source_id 'strava:%'`) –
 * Strava API Policy §7.4: nach Widerruf Strava-Daten löschen. Erledigt-Haken an geplanten Einheiten
 * bleiben (Plan-Status). Scheitert nur das Löschen der Läufe, gilt die Trennung trotzdem; der Server
 * räumt Strava-Zeilen ohnehin nach 7 Tagen weg.
 */
export async function disconnectStrava(userId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.from("strava_connections").delete().eq("user_id", userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Strava] disconnect failed", error);
    return { ok: false };
  }
  await deleteStravaHealthWorkouts(userId);
  return { ok: true };
}
