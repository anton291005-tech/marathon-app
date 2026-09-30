-- Prep-Rückblick: einmal gespeicherter Snapshot aller Recap-Stats einer abgeschlossenen Vorbereitung.
-- Der Rückblick liest nur diesen Snapshot (nicht live neu berechnet) — er bleibt stabil, auch wenn
-- der Plan gelöscht wird oder sich Rechenlogik ändert. Bei älterer schema_version baut die App die
-- stats neu; finish_time_* bleiben dabei erhalten.
--
-- Eindeutig pro (user_id, race_date): plan_id wird bei Plan-Löschung NULL (ON DELETE SET NULL) und
-- NULLs dedupen in Postgres nicht — ein Rückblick pro Renntag ist dagegen immer eindeutig.
--
-- Idempotent: mehrfach ausführbar.

CREATE TABLE IF NOT EXISTS public.prep_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.training_plans (id) ON DELETE SET NULL,
  race_name text,
  race_date date NOT NULL,
  finish_time_seconds integer CHECK (finish_time_seconds IS NULL OR finish_time_seconds > 0),
  finish_time_source text CHECK (finish_time_source IS NULL OR finish_time_source IN ('health', 'manual')),
  finish_time_confirmed boolean NOT NULL DEFAULT false,
  schema_version integer NOT NULL,
  stats jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prep_recaps_user_race_date_unique UNIQUE (user_id, race_date),
  CONSTRAINT prep_recaps_finish_time_shape CHECK (
    (finish_time_seconds IS NULL AND finish_time_source IS NULL AND NOT finish_time_confirmed)
    OR
    (finish_time_seconds IS NOT NULL AND finish_time_source IS NOT NULL)
  )
);

-- Kein eigener user_id-Index nötig: der UNIQUE-Index (user_id, race_date) deckt Abfragen nach user_id ab.

DROP TRIGGER IF EXISTS prep_recaps_set_updated_at ON public.prep_recaps;
CREATE TRIGGER prep_recaps_set_updated_at
  BEFORE UPDATE ON public.prep_recaps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.prep_recaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_data" ON public.prep_recaps;
CREATE POLICY "user_own_data" ON public.prep_recaps
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
