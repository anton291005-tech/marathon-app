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

/**
 * Wrapper-Style einer Session-Zeile: im Scroll-Modus natürliche Höhe, sonst gleichmäßig verteilt —
 * aber nie unter die Inhaltshöhe, sonst schneidet `overflow: hidden` mehrzeilige Zeilen (z. B. der
 * lange Renntag-Titel bei 390px) ab.
 */
export function getWeekSessionRowWrapStyle(scrollMode: boolean): CSSProperties {
  return scrollMode
    ? { flex: "0 0 auto", minHeight: 0, overflow: "visible", display: "flex", flexDirection: "column" }
    : { flex: "1 1 0%", minHeight: "min-content", overflow: "hidden", display: "flex", flexDirection: "column" };
}

/**
 * Container-Style des Session-Stacks im Woche-Tab.
 *
 * `overflowY` ist IMMER "auto": der Stack ist ein flex-Kind mit begrenzter Höhe (flex 1 / minHeight 0
 * unter einem `overflow: hidden`-Root). Seit die Zeilen per minHeight "min-content" nicht mehr unter
 * ihre Inhaltshöhe schrumpfen, kann ihre Summe diese Höhe übersteigen — 7 Zeilen inkl. mehrzeiligem
 * Renntag-Titel in der Race Week. Mit "hidden" verschwand die letzte Zeile unter den
 * Wochen-Pagination-Punkten, ohne erreichbar zu sein.
 *
 * `justifyContent` darf dabei nicht "space-evenly" bleiben: bei negativem Freiraum fällt space-evenly
 * auf "center" zurück, dann ragt der Stack auch oben aus dem Scroll-Container und die erste Zeile wird
 * unerreichbar. Solange Session-Zeilen da sind, ist "flex-start" optisch identisch, weil die Zeilen per
 * flex-grow ohnehin jeden Freiraum aufbrauchen. Ohne Zeilen (Leer-Zustand) bleibt space-evenly.
 */
export function getWeekStackContainerStyle(state: { scrollMode: boolean; hasSessionRows: boolean }): CSSProperties {
  return {
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    justifyContent: state.hasSessionRows ? "flex-start" : "space-evenly",
    gap: state.scrollMode ? 4 : 0,
  };
}
