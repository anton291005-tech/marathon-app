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

export type HomeSpacingScale = "comfortable" | "compact";

/**
 * Home: `md` scale normally; `compact` when viewport budget is exceeded (see App resize observer).
 */
export function getHomeSpacing(scale: HomeSpacingScale, coachExpanded: boolean) {
  const isCompact = scale === "compact";
  return {
    columnGap: coachExpanded ? LAYOUT_SPACING.lg : isCompact ? LAYOUT_SPACING.sm : LAYOUT_SPACING.md,
    belowFoldGap: coachExpanded ? LAYOUT_SPACING.lg : isCompact ? LAYOUT_SPACING.sm : LAYOUT_SPACING.md,
    ringPx: isCompact ? 118 : 138,
    ringToActions: isCompact ? 8 : LAYOUT_SPACING.md,
    horizontalPadding: isCompact ? 12 : 16,
    primaryCardPadding: isCompact ? "6px 8px" : "10px 12px",
    statusStackGap: isCompact ? 4 : 6,
    coachCardPadding: isCompact ? "6px 8px" : "9px 12px",
    coachCardGap: isCompact ? 3 : 6,
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
