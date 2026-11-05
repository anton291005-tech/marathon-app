/**
 * Referenzprofile P1–P6 (docs/plan-spec.md §13) als Eingaben des Kerns. Alle enden an einem Sonntag
 * (14.3.2027), beginnen am Montag und haben alle sieben Tage frei (Long Run So). Planlängen wie in §13.
 * Die Eingaben dieser Datei sind die gemeinsame Quelle für die Profil-Tests der Schritte 5–7.
 */

import { addDays, mondayOf } from "../dates";
import type { CoreInputs, Ymd } from "../types";

export type ProfileName = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export type Profile = {
  name: ProfileName;
  label: string;
  inputs: CoreInputs;
  /** Bezugsdatum für das Alter des Rennergebnisses (`buildPaceProfile`). */
  todayYmd: Ymd;
  weeks: number;
};

const RACE_SUNDAY: Ymd = "2027-03-14";
const ALL_DAYS: CoreInputs["availableDays"] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function make(
  name: ProfileName,
  label: string,
  weeks: number,
  rest: Pick<CoreInputs, "distance" | "runDaysPerWeek" | "currentWeeklyKm"> &
    Partial<Pick<CoreInputs, "recentRace" | "goalTime">>,
  recentRaceWeeksAgo?: number,
): Profile {
  const startYmd = addDays(mondayOf(RACE_SUNDAY), -7 * (weeks - 1));
  const recentRace =
    rest.recentRace !== undefined && recentRaceWeeksAgo !== undefined
      ? { ...rest.recentRace, dateYmd: addDays(startYmd, -7 * recentRaceWeeksAgo) }
      : rest.recentRace;
  return {
    name,
    label,
    todayYmd: startYmd,
    weeks,
    inputs: {
      ...rest,
      recentRace,
      raceDate: RACE_SUNDAY,
      startYmd,
      availableDays: ALL_DAYS.slice(),
    },
  };
}

export const PROFILES: Profile[] = [
  make("P1", "5k Anfänger", 8, { distance: "5k", runDaysPerWeek: 3, currentWeeklyKm: 10 }),
  make("P2", "10k Finisher", 10, {
    distance: "10k",
    runDaysPerWeek: 4,
    currentWeeklyKm: 20,
    recentRace: { distanceKm: 10, timeSeconds: 3720, dateYmd: null, estimated: true },
  }),
  make(
    "P3",
    "HM 1:35",
    12,
    {
      distance: "hm",
      runDaysPerWeek: 5,
      currentWeeklyKm: 45,
      goalTime: 5700,
      recentRace: { distanceKm: 10, timeSeconds: 2610, dateYmd: null, estimated: false },
    },
    4,
  ),
  make(
    "P4",
    "M 4:00",
    16,
    {
      distance: "m",
      runDaysPerWeek: 4,
      currentWeeklyKm: 35,
      goalTime: 14400,
      recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: null, estimated: false },
    },
    6,
  ),
  make(
    "P5",
    "M 2:50",
    18,
    {
      distance: "m",
      runDaysPerWeek: 6,
      currentWeeklyKm: 70,
      goalTime: 10200,
      recentRace: { distanceKm: 21.1, timeSeconds: 4860, dateYmd: null, estimated: false },
    },
    8,
  ),
  make(
    "P6",
    "M 3 Tage",
    18,
    {
      distance: "m",
      runDaysPerWeek: 3,
      currentWeeklyKm: 30,
      recentRace: { distanceKm: 21.1, timeSeconds: 7500, dateYmd: null, estimated: false },
    },
    8,
  ),
];
