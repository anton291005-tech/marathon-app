-- Readiness Schritt 3 (docs/readiness-plan.md, Spec §6.1, §15): Morgen-Check-in und Zustimmung zu Gesundheitsangaben.
-- Check-in-Antworten und Chips sind Gesundheitsdaten (Art. 9 DSGVO, App-Store-Regel 5.1.3): Der Client speichert sie
-- erst nach der Zustimmung in profiles.health_consent_at/_version. Idempotent: mehrfach ausführbar.

CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  calendar_day date NOT NULL,
  sleep_quality smallint CHECK (sleep_quality BETWEEN 1 AND 5),
  energy smallint CHECK (energy BETWEEN 1 AND 5),
  legs smallint CHECK (legs BETWEEN 1 AND 5),
  mind smallint CHECK (mind BETWEEN 1 AND 5),
  sleep_hours_self numeric(4, 2) CHECK (sleep_hours_self BETWEEN 2 AND 14),
  pain jsonb,
  illness jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_checkins_user_day_key UNIQUE (user_id, calendar_day)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_id ON public.daily_checkins (user_id);

DROP TRIGGER IF EXISTS daily_checkins_set_updated_at ON public.daily_checkins;
CREATE TRIGGER daily_checkins_set_updated_at
  BEFORE UPDATE ON public.daily_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_data" ON public.daily_checkins;
CREATE POLICY "user_own_data" ON public.daily_checkins
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS health_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS health_consent_version text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_health_consent_shape') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_health_consent_shape CHECK (
        (health_consent_at IS NULL AND health_consent_version IS NULL)
        OR (health_consent_at IS NOT NULL AND health_consent_version IS NOT NULL)
      );
  END IF;
END $$;
