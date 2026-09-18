import type { WeeklyScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";
import type { SessionType } from "../lib/ai/types";

export type DayCapacityScore = {
  dateIso: string;
  isWeekend: boolean;
  windowMinutes: number;
  busyMinutes: number;
  freeMinutes: number;
  /** 0 = fully booked, 1 = fully free */
  capacityScore: number;
  isFullyBooked: boolean;
  isFullyFree: boolean;
  /** Titles of blocks on this day that look like physical exertion (see `isPhysicalLoadTitle`); empty when none. */
  physicalLoadBlockTitles: string[];
};

const WEEKDAY_WINDOW = { startMinutes: 6 * 60, endMinutes: 22 * 60 }; // 06:00-22:00
const WEEKEND_WINDOW = { startMinutes: 7 * 60, endMinutes: 23 * 60 }; // 07:00-23:00

function dayOfWeekFromIso(dateIso: string): number {
  // 0=Sonntag..6=Samstag, matches weekly_schedule_blocks.day_of_week convention
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

function timeStringToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Lower-case title keywords that mark a calendar block as physical exertion (sports, tournaments).
 * Deliberately excludes generic words like "spiel" or "training". Extend here — matching is done by
 * `isPhysicalLoadTitle`.
 */
export const PHYSICAL_LOAD_TITLE_KEYWORDS: readonly string[] = [
  "fußball",
  "fussball",
  "football",
  "soccer",
  "wettkampf",
  "match",
  "handball",
  "basketball",
  "volleyball",
  "hockey",
  "tennis",
  "badminton",
  "squash",
  "rugby",
  "klettern",
  "bouldern",
  "triathlon",
  "duathlon",
];

/** Keywords shorter than this only match as a whole word ("match" must not hit "Matcha"). */
const MIN_COMPOUND_KEYWORD_LENGTH = 6;

/**
 * True when a word of the title (case-insensitive) equals a keyword or — for keywords of at least
 * `MIN_COMPOUND_KEYWORD_LENGTH` chars — starts or ends with it, so German compounds like
 * "Fußballturnier" or "Hallenfußball" match while mid-word hits do not.
 */
export function isPhysicalLoadTitle(title: string): boolean {
  const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.some((word) =>
    PHYSICAL_LOAD_TITLE_KEYWORDS.some(
      (keyword) =>
        word === keyword ||
        (keyword.length >= MIN_COMPOUND_KEYWORD_LENGTH && (word.startsWith(keyword) || word.endsWith(keyword))),
    ),
  );
}

function blockAppliesToDate(block: WeeklyScheduleBlock, dateIso: string, dayOfWeek: number): boolean {
  const date = dateIso.slice(0, 10);
  if (!block.isRecurring) return block.specificDate.slice(0, 10) === date;

  if (block.dayOfWeek !== dayOfWeek) return false;
  if (block.recurrenceStartDate && date < block.recurrenceStartDate.slice(0, 10)) return false;
  if (block.recurrenceEndDate && date > block.recurrenceEndDate.slice(0, 10)) return false;
  return true;
}

/** Merges overlapping/adjacent [start, end) minute intervals and returns their total duration. */
function mergedBusyMinutes(intervals: Array<[number, number]>, windowStart: number, windowEnd: number): number {
  const clamped = intervals
    .map(([start, end]): [number, number] => [Math.max(start, windowStart), Math.min(end, windowEnd)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [start, end] of clamped) {
    if (curStart === -1) {
      curStart = start;
      curEnd = end;
      continue;
    }
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  if (curStart !== -1) total += curEnd - curStart;
  return total;
}

/**
 * Deterministic capacity score for a single calendar day, derived from weekly_schedule_blocks.
 * capacityScore = freeMinutes / windowMinutes, clamped to [0, 1].
 */
export function computeDayCapacityScore(dateIso: string, blocks: WeeklyScheduleBlock[]): DayCapacityScore {
  const dayOfWeek = dayOfWeekFromIso(dateIso);
  const weekend = isWeekendDay(dayOfWeek);
  const window = weekend ? WEEKEND_WINDOW : WEEKDAY_WINDOW;
  const windowMinutes = window.endMinutes - window.startMinutes;

  const intervals: Array<[number, number]> = [];
  const physicalLoadBlockTitles: string[] = [];
  for (const block of blocks) {
    if (!blockAppliesToDate(block, dateIso, dayOfWeek)) continue;
    const start = timeStringToMinutes(block.startTime);
    const end = timeStringToMinutes(block.endTime);
    if (start == null || end == null || end <= start) continue;
    intervals.push([start, end]);
    const overlapsWindow = Math.min(end, window.endMinutes) > Math.max(start, window.startMinutes);
    if (overlapsWindow && isPhysicalLoadTitle(block.title)) physicalLoadBlockTitles.push(block.title);
  }

  const busyMinutes = mergedBusyMinutes(intervals, window.startMinutes, window.endMinutes);
  const freeMinutes = Math.max(0, windowMinutes - busyMinutes);
  const capacityScore = windowMinutes > 0 ? Math.min(1, Math.max(0, freeMinutes / windowMinutes)) : 0;

  return {
    dateIso: dateIso.slice(0, 10),
    isWeekend: weekend,
    windowMinutes,
    busyMinutes,
    freeMinutes,
    capacityScore,
    isFullyBooked: freeMinutes === 0,
    isFullyFree: busyMinutes === 0,
    physicalLoadBlockTitles,
  };
}

/** interval/tempo/race need real free time; "long" is treated the same way for now — its volume alone is already a load, finer per-type grading is a later iteration. */
const HIGH_INTENSITY_SESSION_TYPES: ReadonlySet<SessionType> = new Set<SessionType>(["tempo", "interval", "race", "long"]);

/** Easy/recovery sessions fit onto a busy day almost as well as a free one, so calendar load barely moves their score. */
const LOW_INTENSITY_CAPACITY_WEIGHT = 0.1;

/**
 * Fit score cap for a high-intensity session on a day with a physically demanding block (e.g. a
 * football tournament): time share alone (50 % booked) would call the day fine. Must stay below
 * `MIN_FIT_SCORE_THRESHOLD` (assignSessionToBestCapacityDay.ts, 0.35) so the day counts as a conflict —
 * not imported from there to avoid a circular import; the invariant is covered by a test.
 */
export const PHYSICAL_LOAD_DAY_FIT_SCORE = 0.2;

/** True when a high-intensity session would land on a day with a physically demanding block. */
export function isPhysicalLoadConflict(session: { type: SessionType }, dayCapacity: DayCapacityScore): boolean {
  return HIGH_INTENSITY_SESSION_TYPES.has(session.type) && dayCapacity.physicalLoadBlockTitles.length > 0;
}

/**
 * Combines a day's raw calendar capacity with the intensity of the session that would be placed
 * there: high-intensity sessions are penalized in proportion to how booked the day is, easy/recovery
 * sessions are not — a busy day is still an acceptable home for a recovery run. High-intensity
 * sessions on a physical-load day are additionally capped at `PHYSICAL_LOAD_DAY_FIT_SCORE`.
 */
export function computeSessionDayFitScore(session: { type: SessionType }, dayCapacity: DayCapacityScore): number {
  const capacity = dayCapacity.capacityScore;
  if (isPhysicalLoadConflict(session, dayCapacity)) return Math.min(capacity, PHYSICAL_LOAD_DAY_FIT_SCORE);
  if (HIGH_INTENSITY_SESSION_TYPES.has(session.type)) return capacity;
  return 1 - (1 - capacity) * LOW_INTENSITY_CAPACITY_WEIGHT;
}
