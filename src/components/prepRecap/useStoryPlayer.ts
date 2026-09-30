import { useCallback, useEffect, useRef, useState } from "react";

export const STORY_SLIDE_DURATION_MS = 6000;

type Options = {
  count: number;
  initialIndex?: number;
  durationMs?: number;
};

export type StoryPlayer = {
  index: number;
  isLast: boolean;
  /** true solange gehalten (Long-Press) oder die App im Hintergrund ist. */
  paused: boolean;
  /** Läuft der Auto-Advance-Timer für die aktuelle Slide? (Letzte Slide: nie.) */
  running: boolean;
  durationMs: number;
  next: () => void;
  prev: () => void;
  setHeld: (held: boolean) => void;
};

/**
 * Taktgeber der Story: 6 s pro Slide, auf der letzten Slide kein Auto-Advance.
 * Pausieren hält die Restzeit fest (kein Neustart der Slide) — der Fortschrittsbalken läuft als
 * CSS-Animation mit `animation-play-state`, damit pro Frame kein React-Render nötig ist.
 */
export function useStoryPlayer({ count, initialIndex = 0, durationMs = STORY_SLIDE_DURATION_MS }: Options): StoryPlayer {
  const clamp = useCallback((i: number) => Math.max(0, Math.min(count - 1, i)), [count]);
  const [index, setIndex] = useState(() => clamp(initialIndex));
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const remainingRef = useRef(durationMs);
  const lastIndexRef = useRef(index);

  const isLast = index >= count - 1;
  const paused = held || hidden;
  const running = !isLast && !paused;

  useEffect(() => {
    setIndex((i) => clamp(i));
  }, [clamp]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (lastIndexRef.current !== index) {
      lastIndexRef.current = index;
      remainingRef.current = durationMs;
    }
    if (!running) return;
    const startedAt = performance.now();
    const timer = setTimeout(() => setIndex((i) => clamp(i + 1)), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (performance.now() - startedAt));
    };
  }, [index, running, durationMs, clamp]);

  const next = useCallback(() => setIndex((i) => clamp(i + 1)), [clamp]);
  const prev = useCallback(() => setIndex((i) => clamp(i - 1)), [clamp]);

  return { index, isLast, paused, running, durationMs, next, prev, setHeld };
}
