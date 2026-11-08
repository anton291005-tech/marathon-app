/**
 * Deterministischer Zufall mit Seed (mulberry32), nur für Tests und Property-Tests.
 * Wird bewusst nicht aus index.ts exportiert: der Kern selbst ist zufallsfrei (Invariante I20).
 */

export type Rng = {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [min, max], beide eingeschlossen. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("empty-list");
      return items[int(0, items.length - 1)];
    },
    chance: (probability: number): boolean => next() < probability,
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}
