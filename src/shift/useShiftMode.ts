import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StoredShiftEntry } from "../lib/supabase/services/shiftEntriesService";
import type { ShiftDayAssessment } from "../readinessCore/shiftDays";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { buildShiftCapacityContext, sortedEntries } from "./shiftAdapter";
import { isShiftModeEnabled } from "./shiftModeFlag";
import { getShiftState, loadShiftData, subscribeShiftState, type ShiftState } from "./shiftStore";

export function useShiftState(): ShiftState {
  return useSyncExternalStore(subscribeShiftState, getShiftState, getShiftState);
}

export type ShiftModeRuntime = {
  /** Flag `REACT_APP_SHIFT_MODE` (Standard an). */
  enabled: boolean;
  /** Flag an, `works_shifts === true` und mindestens ein Eintrag: Dienstplan wirkt auf die Planung. */
  active: boolean;
  state: ShiftState;
  entries: StoredShiftEntry[];
  /** Für die Kapazitäts-Kette; `null` = altes Verhalten. */
  context: ShiftCapacityContext | null;
  dayFor: (ymd: string | null | undefined) => ShiftDayAssessment | null;
  entryFor: (ymd: string | null | undefined) => StoredShiftEntry | null;
};

/** Runtime-Hook des Schicht-Modus: lädt beim Anmelden, stellt Kontext und Lookups bereit. */
export function useShiftMode(userId: string | null | undefined, todayYmd: string, enabled: boolean = isShiftModeEnabled()): ShiftModeRuntime {
  const state = useShiftState();

  useEffect(() => {
    if (!enabled) return;
    void loadShiftData(userId ?? null, todayYmd);
  }, [enabled, userId, todayYmd]);

  const entries = useMemo(() => sortedEntries(state.entriesByDate), [state.entriesByDate]);
  const context = useMemo(
    () => buildShiftCapacityContext({ enabled, worksShifts: state.worksShifts, entries, todayYmd }),
    [enabled, state.worksShifts, entries, todayYmd],
  );

  return useMemo(
    () => ({
      enabled,
      active: context != null,
      state,
      entries,
      context,
      dayFor: (ymd) => (ymd && context ? context.byDate[ymd] ?? null : null),
      entryFor: (ymd) => (ymd && enabled && state.worksShifts === true ? state.entriesByDate[ymd] ?? null : null),
    }),
    [enabled, state, entries, context],
  );
}
