/**
 * Reine Kalender-Helfer auf "YYYY-MM-DD", UTC-basiert und damit ohne Zeitzonen- und Sommerzeit-Effekte.
 * Keine Uhr: "heute" ist immer eine Eingabe. Vorlage: api/_lib/planInvariants.js (Datums-Helfer).
 */

import type { Weekday, Ymd } from "./types";

const DAY_MS = 86400000;

/** Mo … So (Index 0 = Montag). */
export const WEEKDAYS: readonly Weekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MIN_YEAR = 1900;

function utcMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

function format(ms: number): Ymd {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Echtes Kalenderdatum im Format "YYYY-MM-DD" (kein 2026-02-30, kein Jahr vor 1900). */
export function isYmd(value: unknown): value is Ymd {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < MIN_YEAR) return false;
  return format(utcMs(year, month, day)) === value;
}

function parse(ymd: Ymd): number {
  if (!isYmd(ymd)) throw new Error("invalid-ymd");
  return utcMs(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), Number(ymd.slice(8, 10)));
}

/** `ymd` plus `days` Tage (auch negativ). */
export function addDays(ymd: Ymd, days: number): Ymd {
  if (!Number.isFinite(days)) throw new Error("invalid-days");
  return format(parse(ymd) + Math.round(days) * DAY_MS);
}

/** Tage von `b` bis `a` (`a − b`); positiv, wenn `a` später liegt. */
export function diffDays(a: Ymd, b: Ymd): number {
  return Math.round((parse(a) - parse(b)) / DAY_MS);
}

/** Wochentag wie `Date#getUTCDay`: 0 = Sonntag … 6 = Samstag. */
export function dowOf(ymd: Ymd): number {
  return new Date(parse(ymd)).getUTCDay();
}

export function weekdayOf(ymd: Ymd): Weekday {
  return WEEKDAYS[(dowOf(ymd) + 6) % 7];
}

/** Montag der Woche, in der `ymd` liegt. */
export function mondayOf(ymd: Ymd): Ymd {
  return addDays(ymd, -((dowOf(ymd) + 6) % 7));
}

/** Wochennummer von `ymd` (1-basiert), gezählt ab dem Montag `firstMonday`. */
export function weekIndexOf(ymd: Ymd, firstMonday: Ymd): number {
  return Math.floor(diffDays(mondayOf(ymd), firstMonday) / 7) + 1;
}

/** Datum der Woche `weekMonday` am Wochentag `weekday`. */
export function dateInWeek(weekMonday: Ymd, weekday: Weekday): Ymd {
  return addDays(weekMonday, WEEKDAYS.indexOf(weekday));
}
