import React from "react";

/**
 * CANONICAL APP ICON — single source of truth.
 *
 * This component is the ONLY runtime representation of the MyRace app icon.
 * Both the SplashScreen animation and the home-tab in the bottom nav import
 * exclusively from this module.  No other file may render the app icon.
 *
 * Geometry: pixel-accurate centerline of the marathon route + flag,
 * identical to src/assets/AppIcon.svg (which is kept only for raster export
 * tooling, not for runtime rendering).
 *
 * Color: all strokes/fills use `currentColor` so the icon adapts to its
 * context:
 *   - Splash (red bg)  → wrap in a container with color="white"
 *   - Tab bar          → inherits the button's active/inactive color
 */

export const APP_ICON_MODULE = "src/components/AppIcon" as const;

export interface AppIconProps {
  style?: React.CSSProperties;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export function AppIcon({ style, className, "aria-hidden": ariaHidden }: AppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      style={style}
      className={className}
      aria-hidden={ariaHidden}
    >
      {/*
       * FLAG — always visible; gives the stroke-draw animation a destination.
       *
       * All coordinates are pixel-accurate, derived from assets/icon-1024.png
       * via per-row white-pixel cluster analysis in a 64-unit grid
       * (1 unit = 16 px at 1024 px source resolution).
       *
       *   Flag pole :  x=45, y=4–21  (cluster [44-46 c=45] at rows 16–21)
       *   Flag tip  :  x=57, y=9     (cluster right=57 at row 9)
       *   Triangle  :  M 45,4  L 57,9  L 45,15  Z
       *   Base circle: cx=45 cy=21 r=3
       */}
      <line
        id="flag-pole"
        x1="45" y1="4" x2="45" y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        id="flag-pennant"
        d="M 45,4 L 57,9 L 45,15 Z"
        fill="currentColor"
      />
      <circle id="flag-base" cx="45" cy="21" r="3" fill="currentColor" />

      {/*
       * ROUTE — single continuous path.
       * SplashScreen queries #route via getTotalLength() for stroke-dashoffset
       * draw animation.  Geometry is pixel-derived, not hand-authored.
       *
       * Coordinate derivation (assets/icon-1024.png, 64-unit grid):
       *   Start tip     : cluster [8-10 c=9]  at y=57  → M 9,57
       *   Right U-turn  : outer wall x=52 at y=39–43, arc-center≈(48,41) r=3
       *                   → C 52,44 52,38 47,38  (horizontal entry+exit, apex x=52)
       *   Left  U-turn  : leftmost x=8-9 at y=28–30, arc-center≈(12,30) r=3.5
       *                   → C 8,26 8,33 12,33   (horizontal entry+exit, apex x=8)
       *   Flag base     : pole cluster [44-46 c=45] → ends at (45,21)
       *
       * All C-command junctions are tangent-continuous (C1):
       *   (47,44) : adjacent CPs both on y=44  → horizontal ✓
       *   (47,38) : adjacent CPs both on y=38  → horizontal ✓
       *   (12,26) : adjacent CPs both on y=26  → horizontal ✓
       *   (12,33) : adjacent CPs both on y=33  → horizontal ✓
       */}
      <path
        id="route"
        d={[
          "M 9,57",
          "C 20,50 44,44 47,44",  // band 1 — tip → right U-turn entry (horizontal)
          "C 52,44 52,38 47,38",  // right U-turn  — apex x=52, y=41
          "C 44,38 15,26 12,26",  // band 2 — right U-turn exit → left U-turn entry
          "C 8,26 8,33 12,33",    // left U-turn   — apex x=8,  y=30
          "C 15,33 44,21 45,21",  // band 3 — left U-turn exit → flag base
        ].join(" ")}
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
