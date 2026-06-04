import type { RecoveryDailyRow } from "../../../recovery/recoveryTypes";
import { supabase } from "../client";

type DbRecoveryDailyRow = {
  user_id: string;
  calendar_day: string;
  sleep_hours: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  energy_level: number | null;
  signal_meta: unknown | null;
};

function dbRowToRecoveryDailyRow(row: DbRecoveryDailyRow): RecoveryDailyRow | null {
  if (typeof row.calendar_day !== "string" || !row.calendar_day.trim()) return null;
  const date = row.calendar_day.trim().slice(0, 10);
  const out: RecoveryDailyRow = { date };

  if (row.sleep_hours != null && Number.isFinite(row.sleep_hours)) out.sleepHours = row.sleep_hours;
  if (row.hrv_ms != null && Number.isFinite(row.hrv_ms)) out.hrvMs = row.hrv_ms;
  if (row.resting_hr != null && Number.isFinite(row.resting_hr)) out.restingHr = Math.round(row.resting_hr);

  if (row.signal_meta != null && typeof row.signal_meta === "object" && !Array.isArray(row.signal_meta)) {
    out.signalMeta = row.signal_meta as RecoveryDailyRow["signalMeta"];
  }

  return out;
}

function recoveryRowToUpsertPayload(userId: string, row: RecoveryDailyRow) {
  const day =
    typeof row.date === "string" && row.date.length >= 10 ? row.date.trim().slice(0, 10) : "";
  return {
    user_id: userId,
    calendar_day: day,
    sleep_hours: row.sleepHours != null && Number.isFinite(row.sleepHours) ? row.sleepHours : null,
    hrv_ms: row.hrvMs != null && Number.isFinite(row.hrvMs) ? row.hrvMs : null,
    resting_hr: row.restingHr != null && Number.isFinite(row.restingHr) ? Math.round(row.restingHr) : null,
    energy_level: null,
    signal_meta: row.signalMeta != null ? row.signalMeta : null,
  };
}

export async function loadRecoveryDaily(userId: string): Promise<RecoveryDailyRow[] | null> {
  const { data, error } = await supabase
    .from("recovery_daily")
    .select("*")
    .eq("user_id", userId)
    .order("calendar_day", { ascending: true });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[recoveryDailyService] loadRecoveryDaily", error.message);
    }
    return null;
  }

  if (!data || !Array.isArray(data)) return [];

  const out: RecoveryDailyRow[] = [];
  for (const raw of data as DbRecoveryDailyRow[]) {
    const mapped = dbRowToRecoveryDailyRow(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function saveRecoveryDay(userId: string, row: RecoveryDailyRow): Promise<void> {
  const day =
    typeof row.date === "string" && row.date.length >= 10 ? row.date.trim().slice(0, 10) : "";
  if (!day) return;

  const payload = recoveryRowToUpsertPayload(userId, row);
  const { error } = await supabase.from("recovery_daily").upsert(payload, {
    onConflict: "user_id,calendar_day",
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[recoveryDailyService] saveRecoveryDay", error.message);
    }
  }
}
