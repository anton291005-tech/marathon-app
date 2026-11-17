-- Schicht-Modus (Arbeitsplan Freundes-Test W1, docs/readiness-spec.md §7.6): Dienstplan je Tag und zwei Profil-Felder.
-- Idempotent: mehrfach ausführbar. Wird von Anton im Supabase-SQL-Editor angewendet (nicht automatisch).
--
-- shift_date = Kalendertag des Dienstbeginns. end_time <= start_time heißt „endet am Folgetag“ (Nacht 22:00–06:00).
-- kind 'off' (frei) hat keine Zeiten, alle anderen Arten haben beide.

CREATE TABLE IF NOT EXISTS public.shift_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('early', 'late', 'night', 'off', 'custom')),
  start_time time,
  end_time time,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_entries_user_date_key UNIQUE (user_id, shift_date),
  CONSTRAINT shift_entries_times_shape CHECK (
    (kind = 'off' AND start_time IS NULL AND end_time IS NULL)
    OR (kind <> 'off' AND start_time IS NOT NULL AND end_time IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shift_entries_user_id ON public.shift_entries (user_id);

DROP TRIGGER IF EXISTS shift_entries_set_updated_at ON public.shift_entries;
CREATE TRIGGER shift_entries_set_updated_at
  BEFORE UPDATE ON public.shift_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.shift_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_data" ON public.shift_entries;
CREATE POLICY "user_own_data" ON public.shift_entries
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- works_shifts: null = noch nicht gefragt, true/false = Antwort aus Wizard, Karte oder Einstellungen.
-- shift_defaults: eigene Standardzeiten der Chips, z. B. {"early":{"start":"06:00","end":"14:00"}, …}.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS works_shifts boolean,
  ADD COLUMN IF NOT EXISTS shift_defaults jsonb;

-- Prüf-Abfrage nach dem Anwenden:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'shift_entries' ORDER BY ordinal_position;
--   SELECT policyname FROM pg_policies WHERE tablename = 'shift_entries';            -- user_own_data
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('works_shifts', 'shift_defaults');
