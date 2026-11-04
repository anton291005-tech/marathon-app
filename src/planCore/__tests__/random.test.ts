import { createRng } from "../random";

describe("planCore random", () => {
  it("gleicher Seed, gleiche Folge", () => {
    const a = createRng(7);
    const b = createRng(7);
    const seqA = [a.next(), a.int(0, 100), a.chance(0.5), a.next()];
    const seqB = [b.next(), b.int(0, 100), b.chance(0.5), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("verschiedene Seeds, verschiedene Folgen", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("die Folge für Seed 42 ist festgeschrieben (Property-Tests bleiben reproduzierbar)", () => {
    const rng = createRng(42);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });

  it("next liegt in [0, 1)", () => {
    const rng = createRng(123);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("int trifft beide Grenzen und bleibt darin", () => {
    const rng = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.int(3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(Array.from(seen).sort()).toEqual([3, 4, 5, 6]);
    expect(rng.int(9, 9)).toBe(9);
  });

  it("pick liefert Elemente der Liste und wirft bei leerer Liste", () => {
    const rng = createRng(9);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i += 1) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow("empty-list");
  });

  it("chance(0) ist nie wahr, chance(1) immer", () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i += 1) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it("shuffle ist eine Permutation, deterministisch und verändert die Eingabe nicht", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = input.slice();
    const once = createRng(3).shuffle(input);
    const twice = createRng(3).shuffle(input);
    expect(input).toEqual(copy);
    expect(once).toEqual(twice);
    expect(once.slice().sort()).toEqual(copy);
  });
});
