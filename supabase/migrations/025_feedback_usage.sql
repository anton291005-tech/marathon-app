-- Freundes-Test (docs/friend-test/plan.md, W3): Feedback aus der App und schlanke Nutzungsdaten.
--
-- user_feedback: Freitext der Nutzerin/des Nutzers aus „Feedback geben" (Einstellungen → Konto & Hilfe bzw. „Heute").
--   Automatisch angehängt: App-Version, Bildschirm, Gerät/OS. Keine Gesundheitsdaten.
-- usage_events: feste Ereignisnamen ohne Freitext und ohne Gesundheitswerte (src/telemetry/usageEvents.ts).
--
-- RLS: Nutzer dürfen nur eigene Zeilen anlegen und lesen. Keine UPDATE-/DELETE-Policy — gelöscht wird nur über
-- das Konto-Löschen (api/_lib/deleteAccount.js mit Service-Role) bzw. ON DELETE CASCADE.
-- Beides geht an kein Sprachmodell. Auswertung: docs/friend-test/queries.sql (SQL-Editor, Service-Role).
--
-- Idempotent: mehrfach ausführbar. NICHT automatisch anwenden (Anton, SQL-Editor).

CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category text CHECK (category IS NULL OR category IN ('bug', 'idea', 'praise')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 64),
  screen text CHECK (screen IS NULL OR char_length(screen) <= 64),
  device text CHECK (device IS NULL OR char_length(device) <= 128),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON public.user_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created_at ON public.user_feedback (created_at DESC);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_feedback_insert_own" ON public.user_feedback;
CREATE POLICY "user_feedback_insert_own" ON public.user_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_feedback_select_own" ON public.user_feedback;
CREATE POLICY "user_feedback_select_own" ON public.user_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (
    name IN (
      'app_open',
      'onboarding_done',
      'shift_entries_saved',
      'shift_proposal_shown',
      'shift_proposal_accepted',
      'shift_proposal_declined',
      'session_completed',
      'feedback_sent'
    )
  ),
  props jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(props) = 'object' AND pg_column_size(props) <= 1024),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_name_created_at ON public.usage_events (name, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_events_insert_own" ON public.usage_events;
CREATE POLICY "usage_events_insert_own" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "usage_events_select_own" ON public.usage_events;
CREATE POLICY "usage_events_select_own" ON public.usage_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Verifikation (nach dem Anwenden im SQL-Editor):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('user_feedback', 'usage_events');
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('user_feedback', 'usage_events') ORDER BY 1, 2;
--   -- erwartet: je Tabelle genau zwei Policies (INSERT, SELECT), rowsecurity = true
