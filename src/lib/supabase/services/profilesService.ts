import { parseTargetTimeToSeconds } from "../../../appSmartFeatures";
import type { PersistedMarathonPreferences } from "../../../app/runtime/runtimePersistenceTypes";
import { formatRaceClockGerman } from "../../../lib/ai/coachRacePrediction";
import { supabase } from "../client";

type ProfileRow = {
  target_time_seconds: number | null;
  personal_best_seconds: number | null;
  max_heart_rate_bpm: number | null;
  onboarding_complete: boolean | null;
};

function parsePreferenceTimeToSeconds(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const sec = parseTargetTimeToSeconds(String(raw));
  return sec != null && Number.isFinite(sec) && sec > 0 ? Math.round(sec) : null;
}

export async function loadProfile(userId: string): Promise<PersistedMarathonPreferences | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("target_time_seconds, personal_best_seconds, max_heart_rate_bpm, onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[profilesService] loadProfile", error.message);
    }
    return null;
  }

  if (!data) return null;

  const row = data as ProfileRow;
  const out: Record<string, unknown> = {};

  if (row.target_time_seconds != null && Number.isFinite(Number(row.target_time_seconds))) {
    out.targetTime = formatRaceClockGerman(Math.round(Number(row.target_time_seconds)));
  }

  if (row.personal_best_seconds != null && Number.isFinite(Number(row.personal_best_seconds))) {
    out.personalBestTime = formatRaceClockGerman(Math.round(Number(row.personal_best_seconds)));
  } else if (row.personal_best_seconds === null) {
    out.personalBestTime = null;
  }

  if (row.max_heart_rate_bpm != null && Number.isFinite(Number(row.max_heart_rate_bpm))) {
    out.maxHeartRateBpm = Math.round(Number(row.max_heart_rate_bpm));
  } else if (row.max_heart_rate_bpm === null) {
    out.maxHeartRateBpm = null;
  }

  if (row.onboarding_complete === true) {
    out.onboardingComplete = true;
  }

  return out as PersistedMarathonPreferences;
}

export async function saveProfile(userId: string, prefs: PersistedMarathonPreferences): Promise<void> {
  const target_time_seconds = parsePreferenceTimeToSeconds(prefs.targetTime);
  const personal_best_seconds = parsePreferenceTimeToSeconds(prefs.personalBestTime);

  let max_heart_rate_bpm: number | null = null;
  if (prefs.maxHeartRateBpm != null && Number.isFinite(prefs.maxHeartRateBpm)) {
    max_heart_rate_bpm = Math.round(prefs.maxHeartRateBpm);
  }

  const onboarding_complete = prefs.onboardingComplete === true;

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      target_time_seconds,
      personal_best_seconds,
      max_heart_rate_bpm,
      onboarding_complete,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[profilesService] saveProfile", error.message);
    }
  }
}
