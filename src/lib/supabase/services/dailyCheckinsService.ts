import type { CheckInEntry } from "../../../features/checkin/checkInState";
import { supabase } from "../client";

/** Mirrors `public.daily_checkins` (Migration 017). */
export type DbDailyCheckin = {
  user_id: string;
  calendar_day: string;
  sleep_quality: number | null;
  energy: number | null;
  legs: number | null;
  mind: number | null;
  sleep_hours_self: number | string | null;
  pain: CheckInEntry["pain"];
  illness: CheckInEntry["illness"];
};

const scale = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

export function dbRowToCheckIn(row: DbDailyCheckin): CheckInEntry {
  const hours = row.sleep_hours_self == null ? null : Number(row.sleep_hours_self);
  return {
    day: row.calendar_day,
    sleepQuality: scale(row.sleep_quality),
    energy: scale(row.energy),
    legs: scale(row.legs),
    mind: scale(row.mind),
    sleepHoursSelf: hours != null && Number.isFinite(hours) ? hours : null,
    pain: row.pain && typeof row.pain === "object" ? row.pain : null,
    illness: row.illness && typeof row.illness === "object" ? row.illness : null,
  };
}

export function checkInToRow(userId: string, entry: CheckInEntry): DbDailyCheckin {
  return {
    user_id: userId,
    calendar_day: entry.day,
    sleep_quality: scale(entry.sleepQuality),
    energy: scale(entry.energy),
    legs: scale(entry.legs),
    mind: scale(entry.mind),
    sleep_hours_self:
      typeof entry.sleepHoursSelf === "number" && entry.sleepHoursSelf >= 2 && entry.sleepHoursSelf <= 14 ? entry.sleepHoursSelf : null,
    pain: entry.pain,
    illness: entry.illness,
  };
}

/** Check-ins ab `fromYmd` (inklusive). `null` bei Fehler (offline, Tabelle fehlt). */
export async function loadDailyCheckins(userId: string, fromYmd: string): Promise<CheckInEntry[] | null> {
  try {
    const { data, error } = await supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", userId)
      .gte("calendar_day", fromYmd)
      .order("calendar_day", { ascending: true });
    if (error || !Array.isArray(data)) return null;
    return (data as DbDailyCheckin[]).map(dbRowToCheckIn);
  } catch {
    return null;
  }
}

export async function saveDailyCheckin(userId: string, entry: CheckInEntry): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("daily_checkins")
      .upsert(checkInToRow(userId, entry), { onConflict: "user_id,calendar_day" });
    return !error;
  } catch {
    return false;
  }
}
