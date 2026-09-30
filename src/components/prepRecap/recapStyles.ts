import type { CSSProperties } from "react";

/** Gemeinsame Typo/Buttons für Story und Zeit-Eingabe (SF Pro auf iOS über system-ui). */
export const RECAP_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, 'Segoe UI', sans-serif";

export const RECAP_Z_INDEX = 10040;

export const recapOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: RECAP_Z_INDEX,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxSizing: "border-box",
  backgroundColor: "#070912",
  color: "#f8fafc",
  fontFamily: RECAP_FONT,
  WebkitFontSmoothing: "antialiased",
  WebkitTapHighlightColor: "transparent",
};

export const recapEyebrowStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  overflowWrap: "anywhere",
};

export const recapPrimaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 54,
  borderRadius: 999,
  border: "none",
  background: "#f8fafc",
  color: "#0b1020",
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  fontFamily: RECAP_FONT,
  boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
};

export const recapSecondaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  borderRadius: 999,
  border: "1px solid rgba(248,250,252,0.28)",
  background: "rgba(248,250,252,0.06)",
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: RECAP_FONT,
};

export const recapTextButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: "0 16px",
  border: "none",
  background: "transparent",
  color: "rgba(226,232,240,0.7)",
  fontSize: 15,
  fontWeight: 650,
  cursor: "pointer",
  fontFamily: RECAP_FONT,
};

export const recapCloseButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "none",
  background: "rgba(248,250,252,0.1)",
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

export const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Kernzahl: so groß wie möglich, ohne bei 390 px Breite überzulaufen. */
export function heroFontSize(text: string, maxPx: number): string {
  const glyphs = Math.max(1, text.length);
  return `min(${maxPx}px, calc((100vw - 56px) / ${(glyphs * 0.62).toFixed(2)}))`;
}
