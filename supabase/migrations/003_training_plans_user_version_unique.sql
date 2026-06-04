ALTER TABLE public.training_plans
  ADD CONSTRAINT training_plans_user_id_version_key UNIQUE (user_id, version);
