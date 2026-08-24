import { supabase } from "../client";

export type ScheduleBlockCategory = "job" | "study" | "volunteer" | "sport" | "other";

/** Herkunft einer Zeile: manuell/SQL-Testdaten, EventKit-Import oder Onboarding-Preset. */
export type ScheduleBlockSource = "manual" | "eventkit" | "preset";

type ScheduleBlockCommon = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  startTime: string; // "HH:MM" (or "HH:MM:SS" as returned by Postgres `time`)
  endTime: string;
  notes: string | null;
  source: ScheduleBlockSource;
};

export type RecurringScheduleBlock = ScheduleBlockCommon & {
  isRecurring: true;
  dayOfWeek: number; // 0=Sonntag..6=Samstag
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
};

export type OneOffScheduleBlock = ScheduleBlockCommon & {
  isRecurring: false;
  specificDate: string;
};

export type WeeklyScheduleBlock = RecurringScheduleBlock | OneOffScheduleBlock;

/** Row shape for `public.weekly_schedule_blocks` SELECT * (relevant columns). */
export type DbWeeklyScheduleBlockRow = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  is_recurring: boolean;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  notes: string | null;
  // Fehlt bei Selects gegen eine DB, auf der Migration 010 noch nicht angewendet wurde.
  source?: string | null;
  created_at: string;
  updated_at: string;
};

const VALID_CATEGORIES: ScheduleBlockCategory[] = ["job", "study", "volunteer", "sport", "other"];

function toCategory(value: string): ScheduleBlockCategory {
  return (VALID_CATEGORIES as string[]).includes(value) ? (value as ScheduleBlockCategory) : "other";
}

const VALID_SOURCES: ScheduleBlockSource[] = ["manual", "eventkit", "preset"];

function toSource(value: string | null | undefined): ScheduleBlockSource {
  return (VALID_SOURCES as string[]).includes(value ?? "") ? (value as ScheduleBlockSource) : "manual";
}

export function dbRowToScheduleBlock(row: DbWeeklyScheduleBlockRow): WeeklyScheduleBlock | null {
  const common = {
    id: row.id,
    title: row.title,
    category: toCategory(row.category),
    startTime: row.start_time,
    endTime: row.end_time,
    notes: row.notes,
    source: toSource(row.source),
  };

  if (row.is_recurring) {
    if (row.day_of_week == null) return null;
    return {
      ...common,
      isRecurring: true,
      dayOfWeek: row.day_of_week,
      recurrenceStartDate: row.recurrence_start_date,
      recurrenceEndDate: row.recurrence_end_date,
    };
  }

  if (!row.specific_date) return null;
  return {
    ...common,
    isRecurring: false,
    specificDate: row.specific_date,
  };
}

export function scheduleBlockToUpsertPayload(userId: string, block: WeeklyScheduleBlock) {
  return {
    id: block.id,
    user_id: userId,
    title: block.title,
    category: block.category,
    is_recurring: block.isRecurring,
    day_of_week: block.isRecurring ? block.dayOfWeek : null,
    specific_date: block.isRecurring ? null : block.specificDate,
    start_time: block.startTime,
    end_time: block.endTime,
    recurrence_start_date: block.isRecurring ? block.recurrenceStartDate : null,
    recurrence_end_date: block.isRecurring ? block.recurrenceEndDate : null,
    notes: block.notes,
    source: block.source,
  };
}

export async function loadWeeklyScheduleBlocks(userId: string): Promise<WeeklyScheduleBlock[] | null> {
  const { data, error } = await supabase.from("weekly_schedule_blocks").select("*").eq("user_id", userId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyScheduleBlocksService] loadWeeklyScheduleBlocks", error.message);
    }
    return null;
  }

  if (!data || !Array.isArray(data)) return [];

  const out: WeeklyScheduleBlock[] = [];
  for (const raw of data as DbWeeklyScheduleBlockRow[]) {
    const mapped = dbRowToScheduleBlock(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function saveWeeklyScheduleBlock(userId: string, block: WeeklyScheduleBlock): Promise<void> {
  const row = scheduleBlockToUpsertPayload(userId, block);
  const { error } = await supabase.from("weekly_schedule_blocks").upsert(row, { onConflict: "id" });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyScheduleBlocksService] saveWeeklyScheduleBlock", error.message);
    }
  }
}

export type BulkWriteResult = { ok: boolean; insertedCount: number };

/**
 * Replace-All-Sync des EventKit-Imports: löscht ALLE 'eventkit'-Zeilen des Users
 * und schreibt die übergebenen Blöcke frisch. Zeilen mit source 'manual'/'preset'
 * (SQL-Testdaten, Onboarding-Presets) sind über das Delete-Prädikat strukturell geschützt.
 * Nicht transaktional — ein Fehler zwischen Delete und Insert heilt der nächste Sync.
 */
export async function replaceAllEventkitBlocks(
  userId: string,
  blocks: WeeklyScheduleBlock[]
): Promise<BulkWriteResult> {
  return replaceBlocksBySource(userId, "eventkit", blocks);
}

/**
 * Onboarding-Preset-Auswahl: löscht bestehende 'preset'-Zeilen des Users (Preset-Wechsel
 * idempotent) und schreibt die Blöcke des gewählten Presets.
 */
export async function insertPresetBlocks(
  userId: string,
  blocks: WeeklyScheduleBlock[]
): Promise<BulkWriteResult> {
  return replaceBlocksBySource(userId, "preset", blocks);
}

async function replaceBlocksBySource(
  userId: string,
  source: Exclude<ScheduleBlockSource, "manual">,
  blocks: WeeklyScheduleBlock[]
): Promise<BulkWriteResult> {
  const { error: deleteError } = await supabase
    .from("weekly_schedule_blocks")
    .delete()
    .eq("user_id", userId)
    .eq("source", source);

  if (deleteError) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyScheduleBlocksService] replaceBlocksBySource delete", source, deleteError.message);
    }
    return { ok: false, insertedCount: 0 };
  }

  const rows = blocks.filter((b) => b.source === source).map((b) => scheduleBlockToUpsertPayload(userId, b));
  if (rows.length === 0) return { ok: true, insertedCount: 0 };

  const { error: insertError } = await supabase.from("weekly_schedule_blocks").insert(rows);

  if (insertError) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyScheduleBlocksService] replaceBlocksBySource insert", source, insertError.message);
    }
    return { ok: false, insertedCount: 0 };
  }

  return { ok: true, insertedCount: rows.length };
}

export async function deleteWeeklyScheduleBlock(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from("weekly_schedule_blocks").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[weeklyScheduleBlocksService] deleteWeeklyScheduleBlock", error.message);
    }
  }
}
