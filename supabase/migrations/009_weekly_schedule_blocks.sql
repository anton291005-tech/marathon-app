CREATE TABLE IF NOT EXISTS public.weekly_schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('job', 'study', 'volunteer', 'sport', 'other')),
  is_recurring boolean NOT NULL DEFAULT false,
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sonntag..6=Samstag, nur bei is_recurring
  specific_date date,                                        -- nur bei NOT is_recurring
  start_time time NOT NULL,
  end_time time NOT NULL,
  recurrence_start_date date,  -- optional: Gültigkeitsbeginn für recurring Blocks
  recurrence_end_date date,    -- optional: Gültigkeitsende für recurring Blocks
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_schedule_blocks_time_order CHECK (end_time > start_time),
  CONSTRAINT weekly_schedule_blocks_recurrence_shape CHECK (
    (is_recurring AND day_of_week IS NOT NULL AND specific_date IS NULL)
    OR
    (NOT is_recurring AND specific_date IS NOT NULL AND day_of_week IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_weekly_schedule_blocks_user_id ON public.weekly_schedule_blocks (user_id);

DROP TRIGGER IF EXISTS weekly_schedule_blocks_set_updated_at ON public.weekly_schedule_blocks;
CREATE TRIGGER weekly_schedule_blocks_set_updated_at
  BEFORE UPDATE ON public.weekly_schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.weekly_schedule_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_data" ON public.weekly_schedule_blocks;
CREATE POLICY "user_own_data" ON public.weekly_schedule_blocks
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
