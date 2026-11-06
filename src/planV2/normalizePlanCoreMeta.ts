import { WEEKDAYS, isYmd } from "../planCore";
import type { CoreInputs, CoreKind, Distance, PlanRules, RecentRace, RunDays, Weekday } from "../planCore";
import type { PlanCoreMetaV2 } from "./types";

const CORE_KIND_TABLE: Record<CoreKind, true> = {
  REC: true,
  E: true,
  MLR: true,
  LR: true,
  "LR+M": true,
  M: true,
  T: true,
  I: true,
  R: true,
  RACE: true,
  REST: true,
};
const CORE_KINDS = new Set<string>(Object.keys(CORE_KIND_TABLE));
const DISTANCES = new Set<string>(["5k", "10k", "hm", "m"]);
const WEEKDAY_SET = new Set<string>(WEEKDAYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const isNonNegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isWeekday = (v: unknown): v is Weekday => typeof v === "string" && WEEKDAY_SET.has(v);

/** Art des Plan-Kerns; alles Unbekannte wird verworfen (dann gilt die Typ-Logik wie bei Altplänen). */
export function normalizeCoreKind(raw: unknown): CoreKind | undefined {
  return typeof raw === "string" && CORE_KINDS.has(raw) ? (raw as CoreKind) : undefined;
}

function weekdayList(raw: unknown): Weekday[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const days = WEEKDAYS.filter((d) => raw.includes(d));
  return days;
}

function normalizeRecentRace(raw: unknown): RecentRace | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isPositive(raw.distanceKm) || !isPositive(raw.timeSeconds) || typeof raw.estimated !== "boolean") {
    return undefined;
  }
  if (raw.dateYmd !== null && !isYmd(raw.dateYmd)) return undefined;
  return {
    distanceKm: raw.distanceKm,
    timeSeconds: raw.timeSeconds,
    dateYmd: raw.dateYmd,
    estimated: raw.estimated,
  };
}

/**
 * Pflichtfelder ungültig → `null` (kein halber Datensatz); optionale ungültige Felder fallen weg.
 * `freeText` fällt immer weg: der Freitext bleibt nur in den Preferences, nie im Plan (Entscheidung 2026-11-06).
 */
function normalizeCoreInputs(raw: unknown): CoreInputs | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.distance !== "string" || !DISTANCES.has(raw.distance)) return null;
  if (!isYmd(raw.raceDate) || !isYmd(raw.startYmd)) return null;
  const runDays = raw.runDaysPerWeek;
  if (typeof runDays !== "number" || !Number.isInteger(runDays) || runDays < 3 || runDays > 6) return null;
  const availableDays = weekdayList(raw.availableDays);
  if (!availableDays || availableDays.length < runDays) return null;
  if (!isNonNegative(raw.currentWeeklyKm)) return null;

  const recentRace = normalizeRecentRace(raw.recentRace);
  return {
    distance: raw.distance as Distance,
    raceDate: raw.raceDate,
    startYmd: raw.startYmd,
    runDaysPerWeek: runDays as RunDays,
    availableDays,
    ...(isWeekday(raw.longRunDay) ? { longRunDay: raw.longRunDay } : {}),
    currentWeeklyKm: raw.currentWeeklyKm,
    ...(isNonNegative(raw.longestRecentRunKm) ? { longestRecentRunKm: raw.longestRecentRunKm } : {}),
    ...(recentRace ? { recentRace } : {}),
    ...(isPositive(raw.goalTime) ? { goalTime: raw.goalTime } : {}),
  };
}

function normalizeCoreRules(raw: unknown): PlanRules | null {
  if (!isRecord(raw)) return null;
  const unavailableDays = weekdayList(raw.unavailableDays);
  const preferQualityDays = weekdayList(raw.preferQualityDays);
  const avoidTypes = Array.isArray(raw.avoidTypes)
    ? (["I", "R", "T", "M"] as const).filter((t) => (raw.avoidTypes as unknown[]).includes(t))
    : undefined;

  let maxMinutesByDay: Partial<Record<Weekday, number>> | undefined;
  if (isRecord(raw.maxMinutesByDay)) {
    const entries = WEEKDAYS.flatMap((d) => {
      const v = (raw.maxMinutesByDay as Record<string, unknown>)[d];
      return typeof v === "number" && Number.isFinite(v) && v >= 20 && v <= 300 ? [[d, v] as const] : [];
    });
    if (entries.length > 0) maxMinutesByDay = Object.fromEntries(entries);
  }

  return {
    ...(unavailableDays ? { unavailableDays } : {}),
    ...(isWeekday(raw.longRunDay) ? { longRunDay: raw.longRunDay } : {}),
    ...(maxMinutesByDay ? { maxMinutesByDay } : {}),
    ...(preferQualityDays ? { preferQualityDays } : {}),
    ...(avoidTypes ? { avoidTypes: [...avoidTypes] } : {}),
    ...(isPositive(raw.maxWeeklyKm) ? { maxWeeklyKm: raw.maxWeeklyKm } : {}),
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
  };
}

/** `plan.meta.core`: nur bekannte Felder; ist etwas Wesentliches ungültig, entfällt `core` ganz. */
export function normalizePlanCoreMeta(raw: unknown): PlanCoreMetaV2 | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.configVersion !== "string" || !raw.configVersion.trim()) return undefined;
  const inputs = normalizeCoreInputs(raw.inputs);
  const rules = normalizeCoreRules(raw.rules);
  if (!inputs || !rules) return undefined;
  return { configVersion: raw.configVersion.trim(), inputs, rules };
}
