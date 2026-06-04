-- Profile onboarding gate — synced with marathonPreferences.onboardingComplete

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false;
