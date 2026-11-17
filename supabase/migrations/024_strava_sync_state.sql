-- 024_strava_sync_state.sql — Sync-Status des Strava-Imports (POST /api/strava/sync, api/_lib/stravaActivitySync.js).
--
-- last_synced_at   Beginn des letzten erfolgreichen Abgleichs. Der nächste Abgleich fragt ab
--                  last_synced_at − 72 h (Nachzügler-Uploads); ohne Wert die letzten 10 Tage.
-- last_sync_status ok | reconnect_required | rate_limited | error (nur Anzeige/Diagnose).
-- disconnected_at  gesetzt, wenn Strava den Zugriff ablehnt (Refresh 400/401 oder API 401):
--                  die App zeigt „Strava neu verbinden“. Ein neuer OAuth-Callback setzt ihn zurück.
--
-- Ohne diese Migration funktioniert der Endpunkt trotzdem (10-Tage-Fenster, Upsert ist idempotent),
-- er kann den Status nur nicht speichern.
--
-- Idempotent: mehrfach ausführbar. Keine neue Policy nötig: `user_own_data` aus 008 gilt für die
-- ganze Zeile; geschrieben wird ausschließlich mit dem Service-Role-Key.

ALTER TABLE public.strava_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'strava_connections_last_sync_status_check'
  ) THEN
    ALTER TABLE public.strava_connections
      ADD CONSTRAINT strava_connections_last_sync_status_check
      CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'reconnect_required', 'rate_limited', 'error'));
  END IF;
END
$$;

-- Aufräumen des 7-Tage-Caches (Strava API Policy §6.2) läuft über source_id-Präfix + created_at.
CREATE INDEX IF NOT EXISTS idx_health_workouts_user_source_created
  ON public.health_workouts (user_id, source_id, created_at);

-- Verifikation (im SQL-Editor):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'strava_connections'
--    AND column_name IN ('last_synced_at', 'last_sync_status', 'disconnected_at');
