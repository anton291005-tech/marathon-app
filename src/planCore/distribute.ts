/**
 * Verteilung der Wochen-km (docs/plan-spec.md §6): Long Run und Q-Einheiten haben ihre Größe; der Rest geht gewichtet
 * auf E/REC/MLR, jede innerhalb ihrer Limits. Passt der Rest nicht hinein, wird die Woche kleiner ("reduced"), nie eine
 * Einheit größer als ihr Limit. Reicht er nicht für die Mindestdauern, bekommen alle ihre Mindestdauer ("raised").
 *
 * Rechnet in ganzen Zehntel-km, damit die Summe exakt aufgeht (I1).
 */

import { CONFIG } from "./config";
import type { EasyKind, SessionPaces } from "./sessions";
import { easyMinKm } from "./sessions";
import type { RunDays } from "./types";

const EPS = 1e-9;

export type Filler = { kind: EasyKind; minKm: number; maxKm: number };

export type FillerResult = {
  km: number[];
  /** "reduced": Rest über der Summe der Höchstwerte; "raised": Rest unter der Summe der Mindestwerte. */
  status: "ok" | "reduced" | "raised";
};

const tenths = (km: number): number => Math.round(km * 10);

/**
 * Mindest-Wochen-km (Folgepunkt `minWeekKmPerRunDay` aus Schritt 2): jeder Lauftag mindestens ein E-Lauf von 25 min
 * (E darf bis zur Länge des Long Runs gehen, wenn sonst die Mindestdauer nicht passt). Ganze km, aufgerundet.
 */
export function minWeekKm(runDays: RunDays, paces: SessionPaces): number {
  return Math.ceil(runDays * easyMinKm("E", paces) - EPS);
}

/**
 * Verteilt `restKm` auf die Füller nach `distribute.weights`, jeder in [minKm, maxKm]. Gleiche Gewichte bekommen gleiche
 * km; die letzten Zehntel gehen nach dem größten Rundungsrest, bei Gleichstand an den früheren Füller.
 */
export function distributeFillers(fillers: Filler[], restKm: number): FillerResult {
  if (fillers.length === 0) return { km: [], status: tenths(restKm) > 0 ? "reduced" : tenths(restKm) < 0 ? "raised" : "ok" };
  const weights = CONFIG.distribute.weights.value;
  const lo = fillers.map((filler) => tenths(filler.minKm));
  const hi = fillers.map((filler, index) => Math.max(lo[index], tenths(filler.maxKm)));
  const w = fillers.map((filler) => weights[filler.kind]);
  const rest = tenths(restKm);
  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

  if (rest <= sum(lo)) return { km: lo.map((v) => v / 10), status: rest < sum(lo) ? "raised" : "ok" };
  if (rest >= sum(hi)) return { km: hi.map((v) => v / 10), status: rest > sum(hi) ? "reduced" : "ok" };

  // Einheit u mit Σ clamp(w·u, lo, hi) = rest (monoton, Bisektion).
  const at = (u: number): number[] => w.map((weight, index) => Math.min(hi[index], Math.max(lo[index], weight * u)));
  let low = 0;
  let high = Math.max.apply(null, hi.map((v, index) => v / w[index])) + 1;
  for (let step = 0; step < 100; step += 1) {
    const mid = (low + high) / 2;
    if (sum(at(mid)) < rest) low = mid;
    else high = mid;
  }
  const exact = at(high);
  const out = exact.map((value) => Math.floor(value + EPS));
  let missing = rest - sum(out);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value + EPS) }))
    .sort((a, b) => (b.frac - a.frac > EPS ? 1 : a.frac - b.frac > EPS ? -1 : a.index - b.index));
  for (let k = 0; missing > 0 && k < order.length * 2; k += 1) {
    const { index } = order[k % order.length];
    if (out[index] < hi[index]) {
      out[index] += 1;
      missing -= 1;
    }
  }
  return { km: out.map((v) => v / 10), status: "ok" };
}
