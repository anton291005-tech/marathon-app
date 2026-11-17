/**
 * Brücke Service-Zeilen → Readiness-Kern → Kapazitäts-Engine (Schicht-Modus).
 * Wirkung nur bei Flag an UND `works_shifts === true` UND mindestens einem Eintrag; sonst `null` (altes Verhalten).
 */
import type { StoredShiftEntry } from "../lib/supabase/services/shiftEntriesService";
import { assessShiftDays, indexShiftDays, type ShiftDayAssessment, type ShiftEntry } from "../readinessCore/shiftDays";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { shiftLoadRange } from "./shiftStore";

export function toCoreShiftEntries(entries: readonly StoredShiftEntry[]): ShiftEntry[] {
  return entries.map((e) => ({ dateYmd: e.dateYmd, kind: e.kind, start: e.start, end: e.end, label: e.label }));
}

export function sortedEntries(entriesByDate: Readonly<Record<string, StoredShiftEntry>>): StoredShiftEntry[] {
  return Object.keys(entriesByDate)
    .sort()
    .map((d) => entriesByDate[d]);
}

export function isShiftPlanningActive(args: { enabled: boolean; worksShifts: boolean | null; entryCount: number }): boolean {
  return args.enabled && args.worksShifts === true && args.entryCount > 0;
}

/**
 * Tageseignung im Ladebereich (eine Woche zurück bis Vorausschau + 1 Woche).
 * ENTSCHEIDUNG (Anton absegnen): keine geplante Dauer je Tag (`plannedMinByDay`) — der Tag dient auch als Zieltag für
 * andere Einheiten; es gelten die Standarddauern je Art aus `CONFIG.shift`.
 */
export function assessEntries(entries: readonly StoredShiftEntry[], todayYmd: string): ShiftDayAssessment[] {
  const range = shiftLoadRange(todayYmd);
  return assessShiftDays({ entries: toCoreShiftEntries(entries), fromYmd: range.fromYmd, toYmd: range.toYmd });
}

export function buildShiftCapacityContext(args: {
  enabled: boolean;
  worksShifts: boolean | null;
  entries: readonly StoredShiftEntry[];
  todayYmd: string;
}): ShiftCapacityContext | null {
  if (!isShiftPlanningActive({ enabled: args.enabled, worksShifts: args.worksShifts, entryCount: args.entries.length })) return null;
  return { byDate: indexShiftDays(assessEntries(args.entries, args.todayYmd)) };
}
