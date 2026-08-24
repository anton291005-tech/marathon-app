import type { OneOffScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";
import { getAppCalendarYmd } from "../core/time/timeSystem";
import { classifyEventCategory } from "./eventClassifier";
import { generateScheduleBlockId } from "./generateScheduleBlockId";

/**
 * Plattformneutrale Sicht auf ein bereits von EventKit expandiertes Event-Vorkommen
 * (Recurrences liefert EventKit bei Range-Queries als Einzelvorkommen — kein RRULE-Mapping nötig).
 */
export type RawCalendarOccurrence = {
  title: string;
  calendarTitle: string;
  /** EventKit-Kalendertyp, z. B. "local", "calDAV", "exchange", "subscription", "birthday". */
  calendarType: string;
  startMs: number;
  endMs: number;
  isAllDay: boolean;
  /** Event-Status, z. B. "none", "confirmed", "tentative", "canceled". */
  status: string;
};

/** Geburtstags-/Abo-Feed-Kalender (Feiertage etc.) belegen keine reale Zeit. */
const SKIPPED_CALENDAR_TYPES = new Set(["birthday", "subscription"]);
const MIN_EVENT_DURATION_MS = 5 * 60 * 1000;
/** Guard gegen pathologische Mehrtages-Events (Fenster ist ohnehin nur 28 Tage groß). */
const MAX_DAY_SEGMENTS_PER_EVENT = 62;

/**
 * Mappt Event-Vorkommen auf One-Off-Zeilen (`is_recurring=false`) für `weekly_schedule_blocks`.
 * Rein und deterministisch bis auf die generierten Zeilen-IDs.
 *
 * Regeln (siehe Plan-Protokoll 2026-08-24):
 * - Skip: All-Day-Events (würden Tage fälschlich auf Kapazität 0 setzen), birthday-/subscription-
 *   Kalender, stornierte Events, Events < 5 min, Vorkommen außerhalb des Fensters.
 * - Mitternachts-Überlappung: Split in Tages-Segmente (Tag 1 endet 23:59 wegen `end_time > start_time`).
 * - Dedupe über Kalender hinweg per normalisiertem Titel + Datum + Zeitfenster.
 * - Zeiten lokal (Gerätezeitzone) — konsistent mit den lokalen Tagesfenstern der Capacity-Engine.
 *
 * Bekannte v1-Lücke: abgelehnte Einladungen werden mit-importiert (Self-Attendee-Status ist über
 * die Plugin-Bridge unzuverlässig) — Folge ist nur leicht pessimistische Kapazität.
 *
 * @param windowStartYmd inklusives lokales Fensterstart-Datum ("YYYY-MM-DD")
 * @param windowEndYmd   inklusives lokales Fensterend-Datum
 */
export function occurrencesToScheduleBlocks(
  occurrences: RawCalendarOccurrence[],
  windowStartYmd: string,
  windowEndYmd: string
): OneOffScheduleBlock[] {
  const out: OneOffScheduleBlock[] = [];
  const seen = new Set<string>();

  for (const occ of occurrences) {
    if (occ.isAllDay) continue;
    if (SKIPPED_CALENDAR_TYPES.has(occ.calendarType.trim().toLowerCase())) continue;
    const status = occ.status.trim().toLowerCase();
    if (status === "canceled" || status === "cancelled") continue;
    if (occ.endMs - occ.startMs < MIN_EVENT_DURATION_MS) continue;

    for (const segment of splitIntoLocalDaySegments(occ.startMs, occ.endMs)) {
      if (segment.ymd < windowStartYmd || segment.ymd > windowEndYmd) continue;
      if (segment.endHm <= segment.startHm) continue;

      const dedupeKey = `${occ.title.trim().toLowerCase()}|${segment.ymd}|${segment.startHm}|${segment.endHm}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({
        id: generateScheduleBlockId(),
        title: occ.title.trim() || "Termin",
        category: classifyEventCategory(occ.title, occ.calendarTitle),
        startTime: segment.startHm,
        endTime: segment.endHm,
        notes: null,
        source: "eventkit",
        isRecurring: false,
        specificDate: segment.ymd,
      });
    }
  }

  return out;
}

type DaySegment = { ymd: string; startHm: string; endHm: string };

function splitIntoLocalDaySegments(startMs: number, endMs: number): DaySegment[] {
  const segments: DaySegment[] = [];
  let cursor = startMs;

  while (cursor < endMs && segments.length < MAX_DAY_SEGMENTS_PER_EVENT) {
    const segmentStart = new Date(cursor);
    const nextLocalMidnightMs = new Date(
      segmentStart.getFullYear(),
      segmentStart.getMonth(),
      segmentStart.getDate() + 1
    ).getTime();
    const segmentEndMs = Math.min(endMs, nextLocalMidnightMs);

    segments.push({
      ymd: getAppCalendarYmd(segmentStart),
      startHm: toLocalHm(segmentStart),
      endHm: segmentEndMs === nextLocalMidnightMs ? "23:59" : toLocalHm(new Date(segmentEndMs)),
    });

    cursor = nextLocalMidnightMs;
  }

  return segments;
}

function toLocalHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
