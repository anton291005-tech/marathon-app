import type { CSSProperties } from "react";

export type WeekStackLayoutState = {
  hasExpandedSessionDesc: boolean;
  /** Einzel-Tag-Kalenderpanel (mode "preview" | "select"); jeder Modus zählt als offen. */
  pendingCalendarProposal: unknown;
  /** Wochen-Batch-Panel (status "proposal" | "no-conflicts" | "blocked"). */
  weekCalendarBatchProposal: unknown;
};

/**
 * Woche-Tab: true, sobald der Session-Stack mehr Inhalt als seine feste Höhe haben kann — aufgeklappte
 * Beschreibung oder IRGENDEIN offenes Kalender-Panel. Dann scrollt der Container, statt die
 * Session-Zeilen zusammenzuquetschen.
 */
export function shouldWeekStackScroll(state: WeekStackLayoutState): boolean {
  return state.hasExpandedSessionDesc || !!state.pendingCalendarProposal || !!state.weekCalendarBatchProposal;
}

/** Wrapper-Style einer Session-Zeile: im Scroll-Modus natürliche Höhe, sonst gleichmäßig verteilt. */
export function getWeekSessionRowWrapStyle(scrollMode: boolean): CSSProperties {
  return scrollMode
    ? { flex: "0 0 auto", minHeight: 0, overflow: "visible", display: "flex", flexDirection: "column" }
    : { flex: "1 1 0%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" };
}
