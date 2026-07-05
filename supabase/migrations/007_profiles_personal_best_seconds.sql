-- Historical marathon personal best — synced with marathonPreferences.personalBestTime

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_best_seconds integer;
