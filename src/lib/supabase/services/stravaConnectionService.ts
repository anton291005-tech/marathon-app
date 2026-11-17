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

/**
 * `true`/`false` = Verbindung bestätigt bzw. bestätigt nicht vorhanden; `null` = unbekannt (Netzfehler,
 * Offline-Start). Bei `null` bleiben lokale Strava-Läufe und der Import unangetastet.
 */
export async function fetchStravaConnectionStatus(): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from("strava_connections")
      .select("strava_athlete_id")
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[Strava] connection status check failed", error);
      return null;
    }
    return deriveStravaConnected(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Strava] connection status check failed", err);
    return null;
  }
}

/**
 * Trennen: ZUERST die importierten Strava-Läufe löschen (`health_workouts`, `source_id 'strava:%'`),
 * DANN die Connection-Row – Strava API Policy §7.4 verlangt das Löschen nach Widerruf.
 * Scheitert das Löschen der Läufe, bleibt die Verbindung bestehen und es kommt `{ ok: false }` zurück
 * (die App meldet dann „Konnte nicht vollständig trennen“ und der Nutzer versucht es erneut). So meldet
 * die App nie „gelöscht“, wenn nichts gelöscht wurde, und es bleiben keine verwaisten Strava-Zeilen
 * ohne Verbindung zurück (das Server-Aufräumen hängt am Abgleich und läuft ohne Verbindung nicht).
 * Erledigt-Haken an geplanten Einheiten bleiben (Plan-Status).
 */
export async function disconnectStrava(userId: string): Promise<{ ok: boolean }> {
  const deleted = await deleteStravaHealthWorkouts(userId);
  if (!deleted.ok) return { ok: false };
  const { error } = await supabase.from("strava_connections").delete().eq("user_id", userId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Strava] disconnect failed", error);
    return { ok: false };
  }
  return { ok: true };
}
