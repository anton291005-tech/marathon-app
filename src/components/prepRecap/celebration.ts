import confetti from "canvas-confetti";

/**
 * Konfetti für die Renn-Slide. Performance-Budget für das iPhone 13:
 * - höchstens BASE + 2 × SIDE Partikel (≤ 160), begrenzte Lebensdauer (`ticks`)
 * - eigenes Canvas, das nach dem letzten Partikel wieder aus dem DOM entfernt wird
 */

export const CONFETTI_BASE_PARTICLES = 70;
export const CONFETTI_SIDE_PARTICLES = 45;
const EXTRA_BURST_DELAY_MS = 320;
const TICKS = 170;

export type CelebrationHandle = {
  /** Erfüllt, sobald alle Partikel weg sind und das Canvas entfernt wurde. */
  done: Promise<void>;
  /** Sofort abbrechen (Story geschlossen) — entfernt das Canvas. */
  cancel: () => void;
};

export function launchCelebration(opts: { extraBurst: boolean; colors?: string[] }): CelebrationHandle {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.testid = "recap-confetti-canvas";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "10060",
  });
  document.body.appendChild(canvas);

  const fire = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
  const colors = opts.colors;
  let finished = false;
  let extraTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveExtra: (() => void) | null = null;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    if (extraTimer) clearTimeout(extraTimer);
    resolveExtra?.();
    try {
      fire.reset();
    } catch {
      // Canvas evtl. schon weg.
    }
    canvas.remove();
  };

  const shots: Array<Promise<unknown> | null> = [
    fire({
      particleCount: CONFETTI_BASE_PARTICLES,
      spread: 75,
      startVelocity: 42,
      origin: { x: 0.5, y: 0.32 },
      ticks: TICKS,
      scalar: 0.95,
      colors,
    }),
  ];

  let extraDone: Promise<unknown> = Promise.resolve();
  if (opts.extraBurst) {
    extraDone = new Promise<void>((resolve) => {
      resolveExtra = resolve;
      extraTimer = setTimeout(() => {
        extraTimer = null;
        if (finished) return resolve();
        const side = (x: number, angle: number) =>
          fire({
            particleCount: CONFETTI_SIDE_PARTICLES,
            angle,
            spread: 55,
            startVelocity: 55,
            origin: { x, y: 0.7 },
            ticks: TICKS,
            colors,
          });
        void Promise.all([side(0.05, 60), side(0.95, 120)]).then(() => resolve());
      }, EXTRA_BURST_DELAY_MS);
    });
  }

  const done = Promise.all([...shots, extraDone]).then(cleanup, cleanup);
  return { done, cancel: cleanup };
}
