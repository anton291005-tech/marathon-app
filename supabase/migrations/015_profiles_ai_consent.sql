-- KI-Einwilligung (App-Store-Regel 5.1.2(i)): Bevor Daten an einen KI-Anbieter (Anthropic/Claude) gehen,
-- muss der Nutzer ausdrücklich zustimmen. Zustimmung setzt beide Spalten, Widerruf setzt beide auf NULL.
-- Der Server (api/_lib/aiConsent.js) liest die Spalten mit dem Service-Role-Key und blockt ohne Einwilligung.
--
-- `ai_consent_version`: Version des Einwilligungstexts. Ändert sich der Text wesentlich (neue Datenarten,
-- neuer Anbieter), wird die Mindestversion im Code angehoben und alle müssen erneut zustimmen.
--
-- RLS: profiles hat bereits die Policy `user_own_data` (Nutzer liest/schreibt nur die eigene Zeile).
-- Idempotent: mehrfach ausführbar.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_consent_version integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_ai_consent_shape'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ai_consent_shape CHECK (
        (ai_consent_at IS NULL AND ai_consent_version IS NULL)
        OR (ai_consent_at IS NOT NULL AND ai_consent_version IS NOT NULL AND ai_consent_version >= 1)
      );
  END IF;
END $$;
