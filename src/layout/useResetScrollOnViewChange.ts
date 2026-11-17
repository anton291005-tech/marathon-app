import { useEffect, useRef, type RefObject } from "react";

/**
 * Tab-Wechsel beginnt oben: Der äußere Scrollbereich (Einstellungen, Coach) bleibt beim Wechsel derselbe Knoten
 * und behielt seine Position — wer in den Einstellungen gescrollt hatte, landete im nächsten Tab mitten im Inhalt.
 * Die inneren Bereiche der Tabs (`mr-screen`) werden ohnehin neu aufgebaut.
 */
export function useResetScrollOnViewChange(ref: RefObject<HTMLElement | null>, view: string): void {
  const previous = useRef(view);
  useEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    const el = ref.current;
    if (!el) return;
    try {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    } catch {
      /* Knoten ohne Scroll-API: nichts zu tun */
    }
  }, [ref, view]);
}
