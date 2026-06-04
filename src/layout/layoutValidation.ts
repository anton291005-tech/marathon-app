/**
 * Dev-only layout regression signals (does not fail production builds — CRA has no compile hook).
 */

import { LAYOUT_BUDGET } from "./layoutBudget";

export function warnLayoutBudgetViolation(screen: string, detail: string): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.warn(`[LayoutBudget] ${screen}: ${detail}`);
}

/** Call when default UI should not scroll: warns if element content overflows vertically. */
export function validateNoVerticalOverflow(
  el: HTMLElement | null,
  screen: string,
  tolerancePx = 6,
): void {
  if (!el || (typeof process !== "undefined" && process.env.NODE_ENV === "production")) return;
  const over = el.scrollHeight - el.clientHeight;
  if (over > tolerancePx) {
    warnLayoutBudgetViolation(
      screen,
      `vertical overflow ~${Math.round(over)}px (scrollHeight ${el.scrollHeight} vs clientHeight ${el.clientHeight})`,
    );
  }
}

/** Warn if two stacked rects overlap vertically (sibling overlap heuristic). */
export function validateSiblingStackNoOverlap(elements: HTMLElement[], screen: string, tolerancePx = 2): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  if (elements.length < 2) return;
  const rects = elements.map((e) => e.getBoundingClientRect());
  for (let i = 1; i < rects.length; i++) {
    const prev = rects[i - 1];
    const cur = rects[i];
    if (cur.top < prev.bottom - tolerancePx) {
      warnLayoutBudgetViolation(
        screen,
        `sibling overlap detected between stack items (row ~${i})`,
      );
      return;
    }
  }
}

export { LAYOUT_BUDGET };
