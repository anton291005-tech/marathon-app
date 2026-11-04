/**
 * Referenzpunkte aus dem offiziellen VDOT-Rechner (vdoto2.com, abgelesen am 4.11.2026), Eingabe jeweils die 5k-Zeit.
 * Rennzeiten in Sekunden, Paces in Sekunden je km, E als Bereich (`fast` = schnelles Ende). Der Rechner rundet auf ganze
 * Sekunden, die 5k-Eingaben treffen den VDOT auf ±0,05. Test-Toleranz: ±2 s/km.
 *
 * VDOT 30: V.O2-Rechner weicht bei VDOT 30 von Daniels-Gilbert ab (≈ VDOT 32–33) – nicht als Referenz genutzt,
 * Spoho-Review-Punkt (docs/plan-spec.md §14, Punkt 14). Abgelesen wurden E 7:05–7:46 (425–466), T 6:09 (369),
 * I 5:28 (328), R 5:13 (313); geprüft werden dort nur Rennzeiten und M.
 */

// Bewusst ohne Importe: src/__tests__/planCorePurity.test.js erlaubt außerhalb von __tests__ nur "./…"-Importe.

export type DanielsReferenceRow = {
  vdot: number;
  /** Rennzeit je Distanz in Sekunden. */
  raceSeconds: Readonly<Record<"5k" | "10k" | "hm" | "m", number>>;
  paces: {
    m: number;
    e?: { fast: number; slow: number };
    t?: number;
    i?: number;
    r?: number;
  };
};

export const DANIELS_REFERENCE: readonly DanielsReferenceRow[] = [
  {
    vdot: 30,
    raceSeconds: { "5k": 1840, "10k": 3825, hm: 8460, m: 17346 },
    paces: { m: 411 },
  },
  {
    vdot: 40,
    raceSeconds: { "5k": 1446, "10k": 3003, hm: 6658, m: 13780 },
    paces: { e: { fast: 367, slow: 403 }, m: 327, t: 306, i: 282, r: 267 },
  },
  {
    vdot: 50,
    raceSeconds: { "5k": 1197, "10k": 2483, hm: 5499, m: 11455 },
    paces: { e: { fast: 307, slow: 339 }, m: 271, t: 256, i: 235, r: 220 },
  },
  {
    vdot: 60,
    raceSeconds: { "5k": 1023, "10k": 2121, hm: 4689, m: 9804 },
    paces: { e: { fast: 265, slow: 293 }, m: 232, t: 220, i: 203, r: 188 },
  },
  {
    vdot: 70,
    raceSeconds: { "5k": 896, "10k": 1860, hm: 4101, m: 8590 },
    paces: { e: { fast: 234, slow: 258 }, m: 204, t: 194, i: 179, r: 164 },
  },
];
