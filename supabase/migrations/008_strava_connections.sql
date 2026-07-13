-- 008_strava_connections.sql — Strava OAuth connection storage (Supabase/Postgres)

CREATE TABLE public.strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  strava_athlete_id bigint NOT NULL,
  scope text NOT NULL,
  webhook_subscription_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strava_connections_user_id_key UNIQUE (user_id)
);

CREATE INDEX idx_strava_connections_user_id ON public.strava_connections (user_id);

CREATE TRIGGER strava_connections_set_updated_at
  BEFORE UPDATE ON public.strava_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_data" ON public.strava_connections
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
