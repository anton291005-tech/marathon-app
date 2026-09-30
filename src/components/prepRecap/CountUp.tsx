import { useEffect, useRef, type CSSProperties } from "react";
import { srOnlyStyle } from "./recapStyles";

type Props = {
  value: number;
  format: (value: number) => string;
  durationMs?: number;
  /** false → sofort der Endwert (reduced motion). */
  animate: boolean;
  style?: CSSProperties;
  className?: string;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Zählt von 0 auf den Endwert. Schreibt pro Frame direkt in `textContent` statt React-State,
 * damit auf dem Gerät nur ein Textknoten neu gezeichnet wird. Screenreader lesen nur den Endwert.
 */
export default function CountUp({ value, format, durationMs = 1100, animate, style, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = format(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!animate || !(value > 0)) {
      el.textContent = finalText;
      return;
    }
    let raf = 0;
    let start: number | null = null;
    let lastText = "";
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / durationMs);
      const text = t >= 1 ? finalText : format(value * easeOutCubic(t));
      if (text !== lastText) {
        el.textContent = text;
        lastText = text;
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    el.textContent = format(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `format` ist pro Slide stabil; ein neuer Endwert startet die Animation neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, durationMs, finalText]);

  return (
    <span className={className} style={style}>
      <span ref={ref} aria-hidden data-testid="count-up-visual">
        {finalText}
      </span>
      <span style={srOnlyStyle}>{finalText}</span>
    </span>
  );
}
