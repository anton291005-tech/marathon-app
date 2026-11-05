/**
 * Rennwoche (docs/plan-spec.md §8): Rennen und Grenzen der letzten Tage davor.
 *
 * Die Tage (wann Q, E, Ruhe) legt die Platzierung fest (`placement.ts`); hier stehen nur die Größen:
 * - RACE am `raceDate` mit der Renndistanz (`scope.raceKm`) und der Renn-/Zielpace;
 * - Renntag−1 … −`lastDaysCount`: E höchstens `lastDaysMaxMinutes` (30 min), am Tag davor mit Strides;
 * - das Q der Rennwoche kommt aus `qTypes.ts` (Einsteiger: E + Strides, Folgepunkt a).
 */

import { CONFIG } from "./config";
import { diffDays } from "./dates";
import { floorTenth } from "./longRun";
import type { CoreSession, SessionPaces } from "./sessions";
import type { Distance, Ymd } from "./types";

/** Rennen als Einheit; `segments` bleibt leer, die km sind die Renndistanz. */
export function buildRaceSession(ymd: Ymd, distance: Distance, paces: SessionPaces): CoreSession {
  const km = CONFIG.scope.raceKm.value[distance];
  const pace = typeof paces.RACE === "number" ? paces.RACE : paces.E;
  const band = paces.bands.RACE;
  return {
    ymd,
    slot: "RACE",
    kind: "RACE",
    km,
    minutes: Math.round(((km * pace) / 60) * 10) / 10,
    segments: [],
    paceBand: band === undefined ? null : { code: "RACE", fast: band.fast, slow: band.slow },
    qualityKm: 0,
    racePace: false,
    notes: [],
  };
}

/** Tag liegt in den letzten `lastDaysCount` Tagen vor dem Rennen (Renntag selbst nicht). */
export function isLastDaysBeforeRace(ymd: Ymd, raceDate: Ymd): boolean {
  const before = diffDays(raceDate, ymd);
  return before >= 1 && before <= CONFIG.raceWeek.lastDaysCount.value;
}

/** Höchst-km eines Laufs in den letzten Tagen vor dem Rennen (30 min bei der Pace des Laufs); sonst unbegrenzt. */
export function lastDaysMaxKm(ymd: Ymd, raceDate: Ymd, secPerKm: number): number {
  if (!isLastDaysBeforeRace(ymd, raceDate)) return Number.POSITIVE_INFINITY;
  return floorTenth((CONFIG.raceWeek.lastDaysMaxMinutes.value * 60) / secPerKm);
}

/** E am Tag vor dem Rennen bekommt Strides. */
export function stridesBeforeRace(ymd: Ymd, raceDate: Ymd): boolean {
  return CONFIG.raceWeek.stridesDayBefore.value && diffDays(raceDate, ymd) === 1;
}
