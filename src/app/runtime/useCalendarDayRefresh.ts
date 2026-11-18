import { useEffect, useReducer, useRef } from "react";
import { beginAppFrame, getAppTodayYmd } from "../../core/time/timeSystem";

/** Prüfintervall, solange die App sichtbar ist (Tageswechsel bei offener App). */
export const CALENDAR_DAY_CHECK_INTERVAL_MS = 60_000;

/**
 * Neuer Kalendertag → App neu rendern.
 *
 * Die App-Uhr (`core/time/timeSystem.ts`) wird nur beim Rendern aufgefrischt. Bleibt die App über Nacht im
 * Hintergrund (auf dem iPhone der Normalfall) und ändert sich bei der Rückkehr kein State, zeigte „Heute“ weiter
 * den Vortag — bis irgendetwas einen Render auslöste (z. B. der Apple-Health-Abgleich; ohne Verbindung nichts).
 *
 * Geprüft wird bei der Rückkehr in den Vordergrund (`visibilitychange` feuert im Browser und im iOS-WebView,
 * `focus`/`pageshow` als Rückfall) und einmal pro Minute. Gerendert wird nur, wenn sich der Kalendertag geändert hat.
 * Rückgabe: der Kalendertag des aktuellen Renders (YYYY-MM-DD), z. B. als `useMemo`-Abhängigkeit.
 */
export function useCalendarDayRefresh(): string {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const renderedYmd = getAppTodayYmd();
  const renderedRef = useRef(renderedYmd);
  renderedRef.current = renderedYmd;

  useEffect(() => {
    const check = () => {
      beginAppFrame();
      if (getAppTodayYmd() !== renderedRef.current) rerender();
    };
    const onVisibility = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") check();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    if (typeof window !== "undefined") {
      window.addEventListener("focus", check);
      window.addEventListener("pageshow", check);
    }
    const timer = setInterval(check, CALENDAR_DAY_CHECK_INTERVAL_MS);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", check);
        window.removeEventListener("pageshow", check);
      }
      clearInterval(timer);
    };
  }, []);

  return renderedYmd;
}
