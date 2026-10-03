/**
 * Schwebende Tab-Bar: eine Quelle für ihre Maße und den Platz, den jeder Tab unten dafür freihält
 * (UI only — no business logic).
 *
 * Die Bar ist `position: fixed` und liegt über dem Inhalt. Der gemeinsame Inhalts-Wrapper in
 * `AppMain.tsx` reserviert deshalb `getBottomNavContentPadding()` — keine Seite kodiert den Wert selbst.
 */

/** Feste Außenhöhe der Bar (border-box): 52 Button + 21 Padding + 2 Rahmen. */
export const BOTTOM_NAV_HEIGHT_PX = 75;
/** Abstand der Bar zum unteren Rand, zusätzlich zur Safe Area (Home-Indicator). */
export const BOTTOM_NAV_BOTTOM_OFFSET_PX = 12;
/** Luft zwischen dem Ende des Inhalts und der Oberkante der Bar. */
export const BOTTOM_NAV_CONTENT_GAP_PX = 8;

/** Reservierter Platz über der Safe Area: Bar + ihr Abstand zum Rand + Luft zum Inhalt. */
export const BOTTOM_NAV_RESERVED_PX =
  BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_BOTTOM_OFFSET_PX + BOTTOM_NAV_CONTENT_GAP_PX;

const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom, 0px)";

/** `padding-bottom` des Inhalts-Wrappers: der Inhalt endet immer oberhalb der Tab-Bar. */
export function getBottomNavContentPadding(): string {
  return `calc(${BOTTOM_NAV_RESERVED_PX}px + ${SAFE_AREA_BOTTOM})`;
}

/** `bottom` der Tab-Bar selbst. */
export function getBottomNavBottomOffset(): string {
  return `calc(${BOTTOM_NAV_BOTTOM_OFFSET_PX}px + ${SAFE_AREA_BOTTOM})`;
}

/** Home-Dichte: 0 = comfortable, 1 = compact, 2 = dense. */
export type HomeDensityLevel = 0 | 1 | 2;

export const HOME_DENSITY_SCALES = ["comfortable", "compact", "dense"] as const;

/** Unter dieser Viewport-Höhe startet Home direkt kompakt (iPhone SE und kleiner). */
export const HOME_COMPACT_VIEWPORT_HEIGHT_PX = 664;

export function getHomeBaseDensity(viewportHeightPx: number): HomeDensityLevel {
  return viewportHeightPx < HOME_COMPACT_VIEWPORT_HEIGHT_PX ? 1 : 0;
}

/**
 * Nächste Home-Dichte aus der gemessenen Überlänge der Tail-Säule (Einschätzung + Kacheln).
 *
 * Verdichtet nur — nie zurück: sonst pendelt das Layout, weil die kompaktere Stufe selbst keinen
 * Überlauf mehr hat. Zurückgesetzt wird von außen, wenn sich der Home-Zustand oder der Viewport ändert.
 * Mit aufgeklappter Einschätzung soll die Tail-Säule scrollen; dann zählt nur `headerTight`
 * (Kopf-Säule lässt der Tail-Säule zu wenig Platz) — das löst wie bisher das Auto-Einklappen aus.
 */
export function nextHomeDensity(
  prev: HomeDensityLevel,
  input: {
    overflowPx: number;
    viewportHeightPx: number;
    coachExpanded: boolean;
    headerTight?: boolean;
    tolerancePx?: number;
  },
): HomeDensityLevel {
  const base = Math.max(getHomeBaseDensity(input.viewportHeightPx), input.headerTight ? 1 : 0);
  const current = Math.max(prev, base) as HomeDensityLevel;
  if (input.coachExpanded) return current;
  if (input.overflowPx > (input.tolerancePx ?? 2) && current < 2) return (current + 1) as HomeDensityLevel;
  return current;
}
