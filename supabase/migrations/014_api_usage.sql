-- Rate Limit der kostenpflichtigen API-Endpunkte (POST /api/ai, Plan-Erzeugung): Zähler je Nutzer,
-- Bucket und festem Zeitfenster. Der Server (api/_lib/apiQuota.js) ruft consume_api_quota mit dem
-- Service-Role-Key auf, bevor ein KI-Aufruf entsteht.
--
-- Feste Fenster, an der Unix-Epoche ausgerichtet: ein Tagesfenster beginnt um 00:00 UTC, ein
-- Stundenfenster zur vollen Stunde. Abgelehnte Aufrufe zählen mit.
--
-- Zugriff: RLS ist an und es gibt KEINE Policy — anon und authenticated kommen weder an die Tabelle noch
-- an die Funktion (EXECUTE entzogen). Nur service_role (umgeht RLS) schreibt.
--
-- Idempotent: mehrfach ausführbar.

CREATE TABLE IF NOT EXISTS public.api_usage (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (char_length(bucket) BETWEEN 1 AND 64),
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, bucket, window_seconds, window_start)
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_usage FROM anon, authenticated;

-- Erhöht den Zähler des laufenden Fensters atomar um 1 und meldet, ob der Aufruf noch im Limit liegt.
-- Abgelaufene Fenster desselben Nutzers/Buckets werden dabei gelöscht (die Tabelle hält je Nutzer,
-- Bucket und Fenstergröße höchstens eine Zeile).
CREATE OR REPLACE FUNCTION public.consume_api_quota(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_start timestamptz;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_bucket IS NULL OR p_limit IS NULL OR p_limit < 0
     OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'consume_api_quota: invalid arguments';
  END IF;

  v_start := to_timestamp(floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.api_usage AS u (user_id, bucket, window_seconds, window_start, count)
  VALUES (p_user_id, p_bucket, p_window_seconds, v_start, 1)
  ON CONFLICT (user_id, bucket, window_seconds, window_start)
  DO UPDATE SET count = u.count + 1
  RETURNING u.count INTO v_count;

  DELETE FROM public.api_usage AS old
  WHERE old.user_id = p_user_id
    AND old.bucket = p_bucket
    AND old.window_seconds = p_window_seconds
    AND old.window_start < v_start;

  allowed := v_count <= p_limit;
  retry_after_seconds := GREATEST(
    1,
    ceil(extract(epoch FROM (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_quota(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_quota(uuid, text, integer, integer) TO service_role;
