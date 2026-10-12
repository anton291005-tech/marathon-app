import type { CSSProperties, ReactNode } from "react";

export type StatusChipTone = "good" | "fair" | "low" | "accent" | "neutral" | "plain";

/**
 * Zustand als Punkt + Wort (docs/design-system/components.md, „StatusChip").
 * Die Farbe folgt aus dem Zustand; Farbe allein reicht nie, deshalb immer mit Wort.
 */
export function StatusChip({
  tone = "neutral",
  children,
  style,
}: {
  tone?: StatusChipTone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const modifier = tone === "neutral" ? "" : ` mr-chip--${tone}`;
  return (
    <span className={`mr-chip${modifier}`} style={style}>
      {children}
    </span>
  );
}
