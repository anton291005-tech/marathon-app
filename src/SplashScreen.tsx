import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

const BG  = "#B71C1C";
/** SVG coordinate space — must match the viewBox. */
const SZ  = 1254;

/** Diagonal wipe animation duration (ms). */
const ANIM_MS            = 1035;
/** Two rAF ticks before the first tick fires (≈ 34 ms on 60 Hz). */
const RAF_BUDGET_MS      = 40;
/** Pause after wipe fully completes before transitioning to home. */
const PAUSE_AFTER_ANIM   = 200;
/** Minimum time the splash stays visible. */
const MIN_SHOW_MS        = RAF_BUDGET_MS + ANIM_MS + PAUSE_AFTER_ANIM;
/** Exit fade duration. */
const FADE_MS            = 200;

/**
 * Route / S-shape emblem — exact coordinates from the design asset.
 * Do not alter these coordinates.
 */
const ROUTE_D =
  "M275.66 996.22 c-14.08 -12.74 -22.29 -51.43 -16.78 -78.86 8.08 -39.80 34.17 -67.60 74.58 -79.35 " +
  "l11.27 -3.31 240.02 -0.37 c175.98 -0.24 241.86 -0.61 246.76 -1.71 31.11 -6.49 53.88 -34.17 53.88 -65.39 " +
  "-0.12 -28.66 -18.49 -52.90 -47.76 -62.58 -6.37 -2.20 -17.76 -2.33 -235.74 -2.94 l-229 -0.61 -9.18 -2.82 " +
  "c-13.35 -4.04 -32.45 -13.84 -41.64 -21.31 -33.80 -27.80 -47.39 -73.48 -33.68 -113.64 11.88 -34.78 " +
  "36.13 -58.05 72.50 -69.44 l10.78 -3.43 194.71 0 194.71 0 4.04 2.82 c8.57 6.25 10.78 18.49 4.65 26.45 " +
  "-7.23 9.43 11.27 8.57 -200.96 9.31 l-189.81 0.61 -7.72 3.18 c-18.86 7.96 -30.86 18.74 -38.70 34.53 " +
  "-10.65 21.92 -8.57 46.05 5.88 66.25 8.69 12.25 19.84 20.21 35.64 25.47 l8.57 2.82 228.39 0.61 " +
  "c175.98 0.61 229.61 1.10 233.90 2.20 21.92 6 36.13 12.86 47.76 23.02 16.41 14.33 27.80 32.45 33.31 53.15 " +
  "2.33 8.69 2.82 13.35 2.69 27.55 -0.12 14.82 -0.61 18.61 -3.43 27.92 -11.88 39.43 -41.39 66.01 " +
  "-85.36 76.66 -5.63 1.47 -33.43 7.84 -61.72 14.21 -28.29 6.49 -59.39 13.59 -69.19 15.92 " +
  "-9.80 2.33 -30.98 7.23 -47.15 10.90 -16.16 3.80 -50.82 11.76 -77.15 17.88 -26.21 6.12 " +
  "-83.27 19.35 -126.75 29.39 -43.47 10.04 -99.32 22.90 -124.18 28.66 -24.74 5.76 -47.03 10.53 " +
  "-49.23 10.53 -3.06 0 -5.39 -1.22 -8.94 -4.29z";

/**
 * Flag pole + flag — exact coordinates from the design asset.
 * Do not alter these coordinates.
 */
const FLAG_D =
  "M828.33 529.03 c-2.20 -0.73 -5.88 -3.43 -8.20 -6 -6.98 -7.84 -7.59 -18.25 -1.47 -26.94 " +
  "l3.06 -4.53 0 -129.81 c0 -81.31 0.49 -131.28 1.22 -133.97 2.69 -9.92 13.72 -15.80 24.37 -12.98 " +
  "7.47 1.96 147.44 73.72 152.10 78.13 4.90 4.41 4.90 10.90 0 15.43 -3.18 3.06 -42.74 22.78 " +
  "-116.46 58.05 -15.06 7.23 -28.90 14.21 -30.62 15.43 l-3.06 2.33 -0.37 53.52 -0.37 53.52 " +
  "3.06 3.67 c11.14 13.23 3.06 32.94 -14.08 34.78 -2.94 0.24 -7.10 0 -9.18 -0.61z";

/**
 * Ease-in-out quadratic — matches the feel of CSS ease-in-out.
 */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Returns the SVG `points` string for the revealed polygon at eased progress p ∈ [0,1].
 *
 * The wipe sweeps from the bottom-left corner (0, SZ) to the top-right corner (SZ, 0)
 * along the main diagonal. The wipe front is a line perpendicular to that diagonal.
 *
 * Geometry (in SZ×SZ coordinate space):
 *   p ≤ 0.5 → the revealed area is a bottom-left triangle growing toward centre.
 *   p > 0.5 → the revealed area is the full viewBox minus a shrinking top-right triangle.
 *
 * Derivation: the wipe-front line satisfies x − y = SZ·(2p − 1).
 *   p=0  → line through (0, SZ)      (nothing revealed)
 *   p=.5 → line x=y                  (half revealed)
 *   p=1  → line through (SZ, 0)      (fully revealed)
 */
function wipePoints(p: number): string {
  if (p <= 0) return `0,${SZ} 0,${SZ} 0,${SZ}`;
  if (p >= 1) return `0,0 ${SZ},0 ${SZ},${SZ} 0,${SZ}`;

  if (p <= 0.5) {
    const bx = SZ * 2 * p;         // intersection with bottom edge  (bx, SZ)
    const ly = SZ * (1 - 2 * p);   // intersection with left edge    (0, ly)
    return `0,${SZ} ${bx},${SZ} 0,${ly}`;
  } else {
    const tx = SZ * (2 * p - 1);   // intersection with top edge   (tx, 0)
    const ry = SZ * (2 - 2 * p);   // intersection with right edge (SZ, ry)
    return `0,0 ${tx},0 ${SZ},${ry} ${SZ},${SZ} 0,${SZ}`;
  }
}

export interface SplashScreenProps {
  /** True once the main app bundle is ready to show. */
  appReady: boolean;
  /** Called after the exit fade completes; caller should unmount the splash. */
  onDone: () => void;
}

export function SplashScreen({ appReady, onDone }: SplashScreenProps) {
  const mountTimeRef   = useRef(performance.now());
  const clipPolyRef    = useRef<SVGPolygonElement>(null);
  const runningRafRef  = useRef<number>(0);

  const [fading, setFading] = useState(false);
  const [gone,   setGone  ] = useState(false);

  /**
   * Diagonal clip-path wipe animation.
   *
   * Both paths are always rendered as fill="#ffffff".
   * A <polygon> inside a <clipPath> is updated every frame, sweeping from
   * bottom-left to top-right and progressively revealing the solid shapes.
   * No strokeDashoffset is used — this avoids the hollow-interior problem
   * that arises when filled SVG paths are animated as strokes.
   */
  useLayoutEffect(() => {
    const polyEl = clipPolyRef.current;
    if (!polyEl) return;

    polyEl.setAttribute("points", wipePoints(0));

    let startRaf1 = 0;
    let startRaf2 = 0;

    startRaf1 = requestAnimationFrame(() => {
      startRaf2 = requestAnimationFrame(() => {
        let animStart: number | null = null;

        function tick(timestamp: number) {
          if (animStart === null) animStart = timestamp;

          const elapsed = timestamp - animStart;
          const t = Math.min(elapsed / ANIM_MS, 1);
          const p = easeInOut(t);

          polyEl!.setAttribute("points", wipePoints(p));

          if (t < 1) {
            runningRafRef.current = requestAnimationFrame(tick);
          }
        }

        runningRafRef.current = requestAnimationFrame(tick);
      });
    });

    return () => {
      cancelAnimationFrame(startRaf1);
      cancelAnimationFrame(startRaf2);
      cancelAnimationFrame(runningRafRef.current);
    };
  }, []);

  /** Once appReady, honour MIN_SHOW_MS then fade the whole screen out. */
  useEffect(() => {
    if (!appReady) return;

    const elapsed = performance.now() - mountTimeRef.current;
    const wait    = Math.max(0, MIN_SHOW_MS - elapsed);

    const t = window.setTimeout(() => {
      setFading(true);
      window.setTimeout(() => {
        setGone(true);
        onDone();
      }, FADE_MS);
    }, wait);

    return () => window.clearTimeout(t);
  }, [appReady, onDone]);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9999,
        backgroundColor: BG,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        transition:      `opacity ${FADE_MS}ms ease-out`,
        opacity:         fading ? 0 : 1,
        pointerEvents:   fading ? "none" : "auto",
      }}
    >
      <svg
        viewBox="0 0 1254 1254"
        style={{
          width:      "220pt",
          height:     "220pt",
          display:    "block",
          flexShrink: 0,
          overflow:   "visible",
        }}
        aria-hidden="true"
      >
        <defs>
          {/*
           * clipPathUnits defaults to userSpaceOnUse — polygon coordinates
           * are in the same 1254×1254 space as the paths, so no extra
           * transform is needed when the SVG scales to 220pt.
           */}
          <clipPath id="splash-wipe">
            <polygon ref={clipPolyRef} />
          </clipPath>
        </defs>

        {/*
         * Both shapes are always fill="#ffffff" — never stroked.
         * The clip polygon controls visibility; no hollow sections possible.
         */}
        <g clipPath="url(#splash-wipe)">
          <path d={ROUTE_D} fill="#ffffff" />
          <path d={FLAG_D}  fill="#ffffff" />
        </g>
      </svg>
    </div>
  );
}
