/**
 * Plan-Eingaben des Onboardings (docs/plan-spec.md §2, Umbauplan Schritt 9): Lauftage, verfügbare Tage, Long-Run-Tag,
 * Wochen-km als Zahl, längster Lauf der letzten 4 Wochen und letztes Rennergebnis.
 *
 * Bis Schritt 10 liest nur der neue Plan-Kern diese Felder; der heutige Pfad bekommt weiter `weeklyKmRange`, abgeleitet
 * aus der Zahl (`weeklyKmRangeFromKm`). Die Felder sind plan-eigen (`planOwnedPreferences.ts`) und füllen den Wizard
 * beim nächsten Plan vor.
 */

import {
  CONFIG,
  WEEKDAYS,
  defaultLongestRecentRunKm,
  earliestRaceDate,
  resolveLongRunDay,
  weekdayOf,
  type Distance,
  type RunDays,
  type Weekday,
  type Ymd,
} from "../planCore";

export const RUN_DAY_OPTIONS: readonly RunDays[] = [3, 4, 5, 6];

/** Letztes Rennergebnis oder Schätzung, Format wie `RecentRace` im Kern. */
export type OnboardingRecentRace = {
  distanceKm: number;
  timeSeconds: number;
  /** Datum des Wettkampfs; `null` bei einer Schätzung. */
  dateYmd: Ymd | null;
  estimated: boolean;
};

/** Gespeichert unter `preferences.planInputs` (plan-eigen). */
export type OnboardingPlanInputs = {
  runDaysPerWeek: RunDays;
  /** Mo–So in dieser Reihenfolge. */
  availableDays: Weekday[];
  longRunDay: Weekday;
  currentWeeklyKm: number;
  /** Angabe des Nutzers; `null` = keine Angabe (an den Server geht dann der Standardwert). */
  longestRecentRunKm: number | null;
  recentRace: OnboardingRecentRace | null;
};

/** Felder, die zusätzlich im Profil an `POST /api/onboarding/generate-plan-full` gehen. */
export type ProfilePlanInputs = {
  runDaysPerWeek: RunDays;
  availableDays: Weekday[];
  longRunDay: Weekday;
  currentWeeklyKm: number;
  /** Immer > 0 außer bei ausdrücklicher Angabe 0: Angabe oder Standardwert nach Distanz und Lauftagen. */
  longestRecentRunKm: number;
  longestRecentRunKmIsDefault: boolean;
  recentRace: OnboardingRecentRace | null;
};

/** Distanzen für das Rennergebnis: Wettkampf alle vier, Schätzung nur 5k/10k (§2 Frage 4). */
export const RECENT_RACE_DISTANCES: readonly { km: number; label: string; estimateAllowed: boolean }[] = [
  { km: 5, label: "5 km", estimateAllowed: true },
  { km: 10, label: "10 km", estimateAllowed: true },
  { km: 21.1, label: "Halbmarathon", estimateAllowed: false },
  { km: 42.2, label: "Marathon", estimateAllowed: false },
];

export const WEEKLY_KM_MAX = CONFIG.inputs.currentWeeklyKm.value.max;
export const LONGEST_RUN_KM_MAX = CONFIG.inputs.longestRecentRunKm.value.max;

/**
 * Wochen-km → Spanne des heutigen Pfads (`WEEKLY_KM_RANGES`). Obergrenze inklusive: 20 → „0–20 km“, 21 → „20–40 km“.
 * Der alte Generator nimmt die Obergrenze als Deckel (`parseWeeklyKmRangeMax`); so landet niemand in einer zu hohen Spanne.
 */
export function weeklyKmRangeFromKm(km: number): string {
  if (km <= 20) return "0–20 km";
  if (km <= 40) return "20–40 km";
  if (km <= 60) return "40–60 km";
  if (km <= 80) return "60–80 km";
  return "80+ km";
}

/** Long-Run-Tag, wenn der Nutzer keinen gewählt hat oder der gewählte nicht mehr verfügbar ist: So, sonst Sa, sonst der letzte verfügbare Tag. */
export function defaultLongRunDay(availableDays: readonly Weekday[]): Weekday | null {
  if (availableDays.length === 0) return null;
  return resolveLongRunDay({ availableDays: [...availableDays] });
}

/** Verfügbare Tage in der Reihenfolge Mo–So, ohne Doppelte und ohne Unbekanntes. */
export function sortWeekdays(days: readonly string[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.indexOf(day) >= 0);
}

/** „35“, „35,5“, „ 35.5 “ → Zahl mit höchstens einer Nachkommastelle; leer oder ungültig → `null`. */
export function parseKmInput(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

export function weeklyKmError(text: string): string | null {
  if (!text.trim()) return "Bitte deine Wochen-km eingeben.";
  const km = parseKmInput(text);
  if (km === null) return "Bitte eine Zahl eingeben, z. B. 25.";
  if (km > WEEKLY_KM_MAX) return `Höchstens ${WEEKLY_KM_MAX} km pro Woche.`;
  return null;
}

/** Optionales Feld: leer ist gültig. */
export function longestRunError(text: string): string | null {
  if (!text.trim()) return null;
  const km = parseKmInput(text);
  if (km === null) return "Bitte eine Zahl eingeben, z. B. 12.";
  if (km > LONGEST_RUN_KM_MAX) return `Höchstens ${LONGEST_RUN_KM_MAX} km.`;
  return null;
}

/** Fehlermeldung für die Trainingswoche oder `null`. */
export function trainingWeekError(
  runDaysPerWeek: RunDays | null,
  availableDays: readonly Weekday[],
  longRunDay: Weekday | null,
): string | null {
  if (runDaysPerWeek === null) return "Bitte wähle, an wie vielen Tagen du laufen willst.";
  if (availableDays.length < runDaysPerWeek) {
    return `Wähle mindestens ${runDaysPerWeek} Tage, an denen du laufen kannst.`;
  }
  if (longRunDay === null || availableDays.indexOf(longRunDay) < 0) {
    return "Der Long-Run-Tag muss einer deiner Lauftage sein.";
  }
  return null;
}

export function standardLongestRunKm(distance: Distance, runDaysPerWeek: RunDays): number {
  return defaultLongestRecentRunKm(distance, runDaysPerWeek);
}

export function toProfilePlanInputs(inputs: OnboardingPlanInputs, distance: Distance): ProfilePlanInputs {
  const isDefault = inputs.longestRecentRunKm === null;
  return {
    runDaysPerWeek: inputs.runDaysPerWeek,
    availableDays: sortWeekdays(inputs.availableDays),
    longRunDay: inputs.longRunDay,
    currentWeeklyKm: inputs.currentWeeklyKm,
    longestRecentRunKm: isDefault
      ? standardLongestRunKm(distance, inputs.runDaysPerWeek)
      : (inputs.longestRecentRunKm as number),
    longestRecentRunKmIsDefault: isDefault,
    recentRace: inputs.recentRace,
  };
}

// --- Datum ---------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Lokales Kalenderdatum → `YYYY-MM-DD`. */
export function ymdFromLocalDate(date: Date): Ymd {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** `2026-12-07` → „Mo, 07.12.2026“ (die Kürzel des Kerns sind die deutschen Wochentage). */
export function formatYmdGermanWithWeekday(ymd: Ymd): string {
  const [year, month, day] = ymd.split("-");
  return `${weekdayOf(ymd)}, ${day}.${month}.${year}`;
}

const DISTANCE_NAME_DE: Record<Distance, string> = {
  "5k": "5-km-Plan",
  "10k": "10-km-Plan",
  hm: "Halbmarathon-Plan",
  m: "Marathon-Plan",
};

/**
 * Renndatum unter der harten Mindest-Planlänge (§4) → Meldung mit dem frühesten möglichen Renndatum; sonst `null`.
 * Dieselbe Regel wie `planPhases` im Kern (Kalenderwochen Mo–So, die angebrochene Startwoche zählt voll).
 */
export function raceDateTooEarlyMessage(distance: Distance, startDate: Date, raceDate: Date): string | null {
  const startYmd = ymdFromLocalDate(startDate);
  const earliest = earliestRaceDate(distance, startYmd);
  if (ymdFromLocalDate(raceDate) >= earliest) return null;
  const weeks = CONFIG.planLength.hardMinWeeks.value[distance];
  return `Für einen ${DISTANCE_NAME_DE[distance]} brauchst du mindestens ${weeks} Trainingswochen. Frühestes Renndatum: ${formatYmdGermanWithWeekday(earliest)}.`;
}

// --- Vorausfüllen aus den Preferences des letzten Plans ---------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isKm(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function readRecentRace(raw: unknown): OnboardingRecentRace | null {
  if (!isRecord(raw)) return null;
  const known = RECENT_RACE_DISTANCES.filter((d) => d.km === raw.distanceKm)[0];
  if (!known) return null;
  if (typeof raw.timeSeconds !== "number" || !Number.isFinite(raw.timeSeconds) || raw.timeSeconds <= 0) return null;
  if (raw.estimated === true) {
    if (!known.estimateAllowed) return null;
    return { distanceKm: known.km, timeSeconds: Math.round(raw.timeSeconds), dateYmd: null, estimated: true };
  }
  if (raw.estimated !== false || typeof raw.dateYmd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateYmd)) return null;
  return { distanceKm: known.km, timeSeconds: Math.round(raw.timeSeconds), dateYmd: raw.dateYmd, estimated: false };
}

/**
 * Gespeicherte Plan-Eingaben des letzten Plans (Entscheidung 2026-11-06: Bestandsnutzer bekommen die Felder
 * vorausgefüllt). Ungültige Teile fallen weg statt den ganzen Datensatz zu verwerfen; ohne gespeicherte Eingaben `null`.
 */
export function readPlanInputsFromPreferences(preferences: { planInputs?: unknown } | null | undefined): Partial<OnboardingPlanInputs> | null {
  const raw = preferences?.planInputs;
  if (!isRecord(raw)) return null;
  const out: Partial<OnboardingPlanInputs> = {};
  if (RUN_DAY_OPTIONS.indexOf(raw.runDaysPerWeek as RunDays) >= 0) out.runDaysPerWeek = raw.runDaysPerWeek as RunDays;
  if (Array.isArray(raw.availableDays)) {
    const days = sortWeekdays(raw.availableDays.filter((d): d is string => typeof d === "string"));
    if (days.length > 0) out.availableDays = days;
  }
  if (typeof raw.longRunDay === "string" && WEEKDAYS.indexOf(raw.longRunDay as Weekday) >= 0) {
    out.longRunDay = raw.longRunDay as Weekday;
  }
  if (isKm(raw.currentWeeklyKm, WEEKLY_KM_MAX)) out.currentWeeklyKm = raw.currentWeeklyKm;
  if (raw.longestRecentRunKm === null) out.longestRecentRunKm = null;
  else if (isKm(raw.longestRecentRunKm, LONGEST_RUN_KM_MAX)) out.longestRecentRunKm = raw.longestRecentRunKm;
  if (raw.recentRace === null) out.recentRace = null;
  else {
    const race = readRecentRace(raw.recentRace);
    if (race) out.recentRace = race;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// --- Zeit ------------------------------------------------------------------

/** Sekunden → „0:24:30“ bzw. „3:45:00“. */
export function formatRaceSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${pad2(m)}:${pad2(s)}`;
}

/** Vorgabe der Zeit-Auswahl für das Rennergebnis je Distanz. */
export function defaultRecentRaceSeconds(distanceKm: number): number {
  if (distanceKm >= 42) return 4 * 3600;
  if (distanceKm >= 21) return 3600 + 55 * 60;
  if (distanceKm >= 10) return 55 * 60;
  return 28 * 60;
}
