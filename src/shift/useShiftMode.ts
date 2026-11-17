import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StoredShiftEntry } from "../lib/supabase/services/shiftEntriesService";
import type { ShiftDayAssessment } from "../readinessCore/shiftDays";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { isNightShift } from "../readinessCore/shiftDays";
import { buildShiftCapacityContext, sortedEntries } from "./shiftAdapter";
import { isShiftModeEnabled } from "./shiftModeFlag";
import { getShiftState, loadShiftData, subscribeShiftState, type ShiftState } from "./shiftStore";
import { describeShift, shiftShortLabel, todayShiftLineDe } from "./shiftText";

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
  /** Kürzel für den Woche-Tab (nur bei `works_shifts === true`). */
  tagFor: (ymd: string | null | undefined) => { short: string; label: string; night: boolean } | null;
  /** Ein Satz für „Heute“ (nur bei aktivem Schicht-Modus und Bezug des Tages zum Dienstplan). */
  todayLine: (todayYmd: string, sessionType: string | null, hasProposal: boolean) => { text: string; offerProposal: boolean } | null;
  /** Einmalige Karte „Arbeitest du in Schichten?“ für Bestandsnutzer ohne Antwort. */
  introVisible: boolean;
};

/** Kontext direkt aus dem Store (für Handler nach `await`, deren Render-Werte veraltet sein können). */
export function currentShiftCapacityContext(todayYmd: string, enabled: boolean = isShiftModeEnabled()): ShiftCapacityContext | null {
  const state = getShiftState();
  return buildShiftCapacityContext({ enabled, worksShifts: state.worksShifts, entries: sortedEntries(state.entriesByDate), todayYmd });
}

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
      tagFor: (ymd) => {
        const entry = ymd && enabled && state.worksShifts === true ? state.entriesByDate[ymd] : null;
        if (!entry) return null;
        return { short: shiftShortLabel(entry), label: entry.kind === "off" ? "Dienstfrei" : describeShift(entry), night: isNightShift(entry) };
      },
      todayLine: (todayYmd, sessionType, hasProposal) => {
        const day = context ? context.byDate[todayYmd] : null;
        if (!day) return null;
        return { text: todayShiftLineDe(day, sessionType, hasProposal), offerProposal: hasProposal };
      },
      introVisible:
        enabled &&
        !!state.userId &&
        state.userId === (userId ?? null) &&
        state.profileStatus !== "loading" &&
        state.profileStatus !== "idle" &&
        state.worksShifts === null &&
        !state.introDismissed,
    }),
    [enabled, state, entries, context, userId],
  );
}
