/**
 * Deterministic vertical layout budget + spacing tokens (UI only — no business logic).
 */

export type LayoutBudget = {
  /** Home column uses parent flex; this documents intent for consumers */
  homeMaxHeight: string;
  /** Week list row — minimum footprint (collapsed / header band) */
  weekRowMinHeight: number;
  /** Reserved vertical room for “Mehr anzeigen” detail inside a card (scroll container) */
  expandableMaxImpact: number;
  /** Default gap between stacked cards (Week + Overview use compact token at runtime) */
  cardSpacingUnit: number;
};

export const LAYOUT_BUDGET: LayoutBudget = {
  homeMaxHeight: "100%",
  weekRowMinHeight: 92,
  expandableMaxImpact: 140,
  cardSpacingUnit: 8,
};

/** Global spacing — Week + Overview default to `compact`; Home uses `md` with compact fallback */
export const LAYOUT_SPACING = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  compact: 5,
} as const;

export type HomeSpacingScale = "comfortable" | "compact" | "dense";

/**
 * Home: `md` scale normally; `compact` when viewport budget is exceeded, `dense` when compact still
 * overflows (z. B. Abschluss-Hero auf 844 pt) — siehe `nextHomeDensity` + Resize-Observer in AppMain.
 * Keine Schrift unter 11 pt wird hier neu eingeführt; `dense` verkleinert nur Ring und Abstände.
 */
export function getHomeSpacing(scale: HomeSpacingScale, coachExpanded: boolean) {
  const isDense = scale === "dense";
  const isCompact = scale === "compact" || isDense;
  const stackGap = isDense ? LAYOUT_SPACING.compact : isCompact ? LAYOUT_SPACING.sm : LAYOUT_SPACING.md;
  return {
    columnGap: coachExpanded ? LAYOUT_SPACING.lg : stackGap,
    belowFoldGap: coachExpanded ? LAYOUT_SPACING.lg : stackGap,
    ringPx: isDense ? 104 : isCompact ? 118 : 138,
    ringFontPx: isDense ? 28 : 33,
    ringToActions: isDense ? 6 : isCompact ? 8 : LAYOUT_SPACING.md,
    horizontalPadding: isCompact ? 12 : 16,
    primaryCardPadding: isCompact ? "6px 8px" : "10px 12px",
    statusStackGap: isCompact ? 4 : 6,
    coachCardPadding: isDense ? "5px 8px" : isCompact ? "6px 8px" : "9px 12px",
    coachCardGap: isDense ? 2 : isCompact ? 3 : 6,
    metricsTopTilePadding: isDense ? "4px 5px" : "6px 5px",
    metricsTilePadding: isDense ? "4px 7px" : "7px 7px",
    metricsTileGap: isDense ? 2 : 3,
  };
}

/** Week + Overview list/card gaps */
export function getCompactScreenSpacing(): { cardGap: number; screenPaddingX: number; screenPaddingY: number } {
  return {
    cardGap: LAYOUT_SPACING.compact,
    screenPaddingX: 8,
    screenPaddingY: 6,
  };
}
