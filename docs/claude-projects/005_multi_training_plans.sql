-- Multi training plans: up to 5 plans per user, one active at a time.

ALTER TABLE public.training_plans
  RENAME COLUMN version TO schema_version;

ALTER TABLE public.training_plans
  ADD COLUMN plan_slot integer,
  ADD COLUMN plan_name text,
  ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Existing rows: slot from former schema row key (1 or 2), default names
UPDATE public.training_plans
SET
  plan_slot = schema_version,
  plan_name = 'Trainingsplan ' || schema_version,
  is_active = false;

-- Highest slot per user becomes active (typically schema v2)
UPDATE public.training_plans t1
SET is_active = true
WHERE t1.schema_version = (
  SELECT MAX(t2.schema_version)
  FROM public.training_plans t2
  WHERE t2.user_id = t1.user_id
);

ALTER TABLE public.training_plans
  ALTER COLUMN plan_slot SET NOT NULL;

ALTER TABLE public.training_plans
  DROP CONSTRAINT training_plans_user_id_version_key;

ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_user_id_slot_key UNIQUE (user_id, plan_slot);

CREATE UNIQUE INDEX training_plans_one_active_per_user
  ON public.training_plans (user_id)
  WHERE is_active = true;
