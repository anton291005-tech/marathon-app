-- Gesundheits-Zustimmung v2 (docs/readiness-data-sources.md, TODO „Vor Merge“): Zeitstempel vom Server und
-- Widerruf mit Löschung der gespeicherten Gesundheitswerte in einer Transaktion.
--
-- Reihenfolge: nach 021 einspielen (021 legt session_logs.rpe_source an). Die Funktion unten prüft die Spalte
-- trotzdem zur Laufzeit, damit sie auch ohne 021 nicht scheitert.
-- Voraussetzung: 016 (session_logs.rpe) und 017 (daily_checkins, profiles.health_consent_*).
-- Idempotent: mehrfach ausführbar.

-- 1) Zeitstempel vom Server: Was der Client in health_consent_at schickt, wird beim Setzen/Ändern der Zustimmung
--    durch now() der Datenbank ersetzt. Der Client schickt weiter einen Wert, weil der Check-Constraint aus 017
--    beide Spalten zusammen verlangt.
CREATE OR REPLACE FUNCTION public.profiles_health_consent_server_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.health_consent_version IS NULL THEN
    NEW.health_consent_at := NULL;
  ELSIF TG_OP = 'INSERT'
     OR NEW.health_consent_version IS DISTINCT FROM OLD.health_consent_version
     OR NEW.health_consent_at IS DISTINCT FROM OLD.health_consent_at THEN
    NEW.health_consent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_health_consent_server_time ON public.profiles;
CREATE TRIGGER profiles_health_consent_server_time
  BEFORE INSERT OR UPDATE OF health_consent_at, health_consent_version ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_health_consent_server_time();

-- 2) Widerruf: Zustimmung zurücksetzen und die gespeicherten Gesundheitswerte des aufrufenden Nutzers löschen:
--    alle Check-ins, alle Erholungs-Tageszeilen, die Anstrengung je Einheit (rpe, rpe_source). Trainings
--    (health_workouts) und die session_logs-Zeilen selbst bleiben. SECURITY INVOKER: RLS user_own_data gilt.
CREATE OR REPLACE FUNCTION public.revoke_health_consent_and_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n_checkins integer := 0;
  n_recovery integer := 0;
  n_rpe integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.daily_checkins WHERE user_id = uid;
  GET DIAGNOSTICS n_checkins = ROW_COUNT;

  DELETE FROM public.recovery_daily WHERE user_id = uid;
  GET DIAGNOSTICS n_recovery = ROW_COUNT;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'session_logs' AND column_name = 'rpe_source'
  ) THEN
    EXECUTE 'UPDATE public.session_logs SET rpe = NULL, rpe_source = NULL
             WHERE user_id = $1 AND (rpe IS NOT NULL OR rpe_source IS NOT NULL)' USING uid;
  ELSE
    UPDATE public.session_logs SET rpe = NULL WHERE user_id = uid AND rpe IS NOT NULL;
  END IF;
  GET DIAGNOSTICS n_rpe = ROW_COUNT;

  UPDATE public.profiles SET health_consent_at = NULL, health_consent_version = NULL WHERE user_id = uid;

  RETURN jsonb_build_object('daily_checkins', n_checkins, 'recovery_daily', n_recovery, 'session_logs_rpe', n_rpe);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_health_consent_and_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_health_consent_and_data() TO authenticated;

-- Prüf-Abfragen nach dem Einspielen (SQL-Editor):
--   SELECT tgname FROM pg_trigger WHERE tgname = 'profiles_health_consent_server_time';          -- 1 Zeile
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'revoke_health_consent_and_data';      -- prosecdef = false
--   SELECT has_function_privilege('authenticated', 'public.revoke_health_consent_and_data()', 'EXECUTE'); -- true
--   SELECT has_function_privilege('anon', 'public.revoke_health_consent_and_data()', 'EXECUTE');          -- false
