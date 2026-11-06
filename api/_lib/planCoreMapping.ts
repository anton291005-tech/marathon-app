/**
 * Wizard-Profil (`PlanGenerationProfile`, nach `validatePlanBody`) → Eingaben des Plan-Kerns (`CoreInputs`, Spec §2).
 * Umbauplan Schritt 10. Kein Nutzerinhalt in den Rückgaben außer den Eingaben selbst; `reason`/`fields`/`notes`
 * sind feste Codes und Feldnamen und dürfen ins Log.
 *
 * `freeText` wird nie gesetzt: die Wünsche des Nutzers bleiben in den Preferences (Entscheidung 2026-11-06).
 */

import { WEEKDAYS, isYmd } from "../../src/planCore";
import type { CoreInputs, Distance, RecentRace, RunDays, Weekday, Ymd } from "../../src/planCore";

export type PlanProfile = Record<string, unknown>;

export type MappingFailure = "inputs-missing" | "distance-unsupported" | "dates-invalid";

export type MappingResult =
  | { ok: true; inputs: CoreInputs; notes: MappingNote[] }
  | { ok: false; reason: MappingFailure; fields: string[] };

/** Hinweise, wenn eine optionale Angabe verworfen wurde (der Plan entsteht trotzdem). */
export type MappingNote = "recent-race-date-invalid" | "recent-race-date-in-future" | "goal-time-invalid";

/** Kalendertag in Europe/Berlin (die App rechnet in deutscher Ortszeit; Vercel läuft in UTC). */
export function berlinTodayYmd(now: Date): Ymd {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** „9.11.2026“ / „09.11.2026“ → `2026-11-09`; kein echtes Datum → `null`. */
export function germanDateToYmd(value: unknown): Ymd | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const ymd = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isYmd(ymd) ? ymd : null;
}

/** Renndistanz des Wizards → Distanz des Kerns. Ältere Clients schicken 42,195 statt 42,2. */
export function coreDistanceOfKm(km: unknown): Distance | null {
  if (typeof km !== "number" || !Number.isFinite(km)) return null;
  if (km === 5) return "5k";
  if (km === 10) return "10k";
  if (km >= 21 && km <= 21.2) return "hm";
  if (km >= 42 && km <= 42.3) return "m";
  return null;
}

/** „3:30:00“ oder „1:45“ (h:mm) → Sekunden; sonst `null`. */
export function goalSecondsOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const [h, m, s = 0] = parts.map(Number);
  if (m > 59 || s > 59) return null;
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

const isRunDays = (value: unknown): value is RunDays => value === 3 || value === 4 || value === 5 || value === 6;
const isWeekday = (value: unknown): value is Weekday => typeof value === "string" && WEEKDAYS.indexOf(value as Weekday) >= 0;
const isKm = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;

function mapRecentRace(raw: unknown, todayYmd: Ymd, notes: MappingNote[]): RecentRace | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const race = raw as Record<string, unknown>;
  if (typeof race.distanceKm !== "number" || typeof race.timeSeconds !== "number") return undefined;
  if (race.estimated === true) {
    return { distanceKm: race.distanceKm, timeSeconds: race.timeSeconds, dateYmd: null, estimated: true };
  }
  // Wettkampf: das Datum muss es geben und darf nicht in der Zukunft liegen. Sonst ohne Rennergebnis (Einsteiger-Modus).
  if (typeof race.dateYmd !== "string" || !isYmd(race.dateYmd)) {
    notes.push("recent-race-date-invalid");
    return undefined;
  }
  if (race.dateYmd > todayYmd) {
    notes.push("recent-race-date-in-future");
    return undefined;
  }
  return { distanceKm: race.distanceKm, timeSeconds: race.timeSeconds, dateYmd: race.dateYmd, estimated: false };
}

export function profileToCoreInputs(profile: PlanProfile, todayYmd: Ymd): MappingResult {
  const missing: string[] = [];
  if (!isRunDays(profile.runDaysPerWeek)) missing.push("runDaysPerWeek");
  if (!Array.isArray(profile.availableDays)) missing.push("availableDays");
  if (!isKm(profile.currentWeeklyKm, 150)) missing.push("currentWeeklyKm");
  if (missing.length > 0) return { ok: false, reason: "inputs-missing", fields: missing };

  const distance = coreDistanceOfKm(profile.raceDistanceKm);
  if (distance === null) return { ok: false, reason: "distance-unsupported", fields: ["raceDistanceKm"] };

  const raceDate = germanDateToYmd(profile.raceDate);
  const startText = typeof profile.planStartDate === "string" ? profile.planStartDate.trim() : "";
  const startYmd = startText ? germanDateToYmd(startText) : todayYmd;
  const badDates: string[] = [];
  if (raceDate === null) badDates.push("raceDate");
  if (startYmd === null) badDates.push("planStartDate");
  if (raceDate === null || startYmd === null) return { ok: false, reason: "dates-invalid", fields: badDates };

  const runDaysPerWeek = profile.runDaysPerWeek as RunDays;
  const availableDays = WEEKDAYS.filter((day) => (profile.availableDays as unknown[]).indexOf(day) >= 0);
  if (availableDays.length < runDaysPerWeek) return { ok: false, reason: "inputs-missing", fields: ["availableDays"] };

  const notes: MappingNote[] = [];
  const inputs: CoreInputs = {
    distance,
    raceDate,
    startYmd,
    runDaysPerWeek,
    availableDays,
    currentWeeklyKm: profile.currentWeeklyKm as number,
  };
  if (isWeekday(profile.longRunDay) && availableDays.indexOf(profile.longRunDay) >= 0) inputs.longRunDay = profile.longRunDay;
  if (isKm(profile.longestRecentRunKm, 45)) inputs.longestRecentRunKm = profile.longestRecentRunKm;
  const recentRace = mapRecentRace(profile.recentRace, todayYmd, notes);
  if (recentRace) inputs.recentRace = recentRace;
  if (profile.raceGoal === "time") {
    const goal = goalSecondsOf(profile.raceTargetTime);
    if (goal === null) notes.push("goal-time-invalid");
    else inputs.goalTime = goal;
  }
  return { ok: true, inputs, notes };
}
