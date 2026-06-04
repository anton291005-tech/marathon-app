-- 001_initial_schema.sql — initial MyRace user data schema (Supabase/Postgres)

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  target_time_seconds integer,
  max_heart_rate_bpm integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version integer NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  completed boolean,
  skipped boolean,
  feeling integer,
  actual_distance_meters double precision,
  notes text,
  assigned_run jsonb,
  run_evaluation jsonb,
  logged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id text NOT NULL,
  changes jsonb NOT NULL,
  reason text,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.health_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  workout_type text,
  start_time timestamptz,
  duration_seconds integer,
  distance_meters double precision,
  avg_heart_rate integer,
  calories integer,
  splits jsonb,
  laps jsonb,
  gps_stream jsonb,
  interval_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_workouts_user_source_unique UNIQUE (user_id, source_id)
);

CREATE TABLE public.recovery_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  calendar_day date NOT NULL,
  sleep_hours double precision,
  hrv_ms double precision,
  resting_hr integer,
  energy_level integer,
  signal_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recovery_daily_user_id_calendar_day_key UNIQUE (user_id, calendar_day)
);

CREATE TABLE public.coach_memory (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_plans_user_id ON public.training_plans (user_id);

CREATE INDEX idx_session_logs_user_id ON public.session_logs (user_id);

CREATE INDEX idx_session_logs_session_id ON public.session_logs (session_id);

CREATE INDEX idx_plan_patches_user_id ON public.plan_patches (user_id);

CREATE INDEX idx_health_workouts_user_id ON public.health_workouts (user_id);

CREATE INDEX idx_recovery_daily_user_id ON public.recovery_daily (user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER training_plans_set_updated_at
  BEFORE UPDATE ON public.training_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER coach_memory_set_updated_at
  BEFORE UPDATE ON public.coach_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plan_patches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.health_workouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recovery_daily ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coach_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_data" ON public.profiles
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.training_plans
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.session_logs
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.plan_patches
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.health_workouts
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.recovery_daily
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_own_data" ON public.coach_memory
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
