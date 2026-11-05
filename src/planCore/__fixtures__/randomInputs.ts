/**
 * Zufällige gültige Eingaben für Property-Tests der Einheiten (Schritt 6). Liegt unter `__fixtures__`, damit andere
 * Tests sie importieren können, ohne eine Testdatei mitzuladen.
 */

import { CONFIG } from "../config";
import { addDays, mondayOf, WEEKDAYS } from "../dates";
import { predictRaceSeconds } from "../pace";
import { createRng } from "../random";
import type { CoreInputs, Distance, RunDays } from "../types";

const DISTANCES: Distance[] = ["5k", "10k", "hm", "m"];
const RACE_KM = [5, 10, 21.1];

/** Zufällige gültige Eingaben: alle Distanzen, 3–6 Tage, verfügbare Tage, LR-Tag, Planlängen, Umfang 0–150, mit/ohne Rennangabe und Ziel. */
export function randomInputs(seed: number): { inputs: CoreInputs; todayYmd: string } {
  const rng = createRng(seed);
  const distance = rng.pick(DISTANCES);
  const runDaysPerWeek = rng.int(3, 6) as RunDays;
  const size = rng.int(runDaysPerWeek, 7);
  const picked = rng.shuffle(WEEKDAYS).slice(0, size);
  const availableDays = WEEKDAYS.filter((day) => picked.indexOf(day) >= 0);
  const raceDate = addDays("2027-02-01", rng.int(0, 400));
  const weeks = rng.int(CONFIG.planLength.hardMinWeeks.value[distance], CONFIG.planLength.maxWeeks.value[distance] + 2);
  const startYmd = addDays(mondayOf(raceDate), -7 * (weeks - 1) + rng.int(0, 6));
  const currentWeeklyKm = rng.chance(0.1) ? rng.int(0, 10) : rng.int(5, 120);
  const inputs: CoreInputs = {
    distance,
    raceDate,
    startYmd,
    runDaysPerWeek,
    availableDays,
    longRunDay: rng.chance(0.5) ? undefined : rng.pick(availableDays),
    currentWeeklyKm,
  };
  if (rng.chance(0.3)) inputs.longestRecentRunKm = rng.int(0, Math.min(45, Math.max(5, currentWeeklyKm)));
  if (rng.chance(0.7)) {
    const vdot = rng.int(30, 70);
    const km = rng.pick(RACE_KM);
    const estimated = rng.chance(0.3);
    inputs.recentRace = {
      distanceKm: km,
      timeSeconds: Math.round(predictRaceSeconds(vdot, km)),
      dateYmd: estimated ? null : addDays(startYmd, -7 * rng.int(0, 30)),
      estimated,
    };
    if (rng.chance(0.5)) inputs.goalTime = Math.round(predictRaceSeconds(vdot + rng.int(-3, 4), CONFIG.scope.raceKm.value[distance]));
  }
  return { inputs, todayYmd: startYmd };
}
