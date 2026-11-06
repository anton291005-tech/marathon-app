/**
 * Offline-Vergleich alt/neu (Umbauplan Schritt 10, Abnahme v3): derselbe Fall als Wizard-Profil durch
 * 1. Server-Whitelist (`validatePlanBody`) → Mapping (`profileToCoreInputs`) → `buildCheckedPlan` (neu) und
 * 2. den deterministischen heutigen Generator (`generateMarathonPlanV2ToRace` mit der Standardstruktur, wie im
 *    Rückfall von `phasedFullPlanGenerator.js`, ohne Claude) (alt).
 * Beide Pläne bekommen dieselben Kennzahlen (`planMetrics`). Genutzt von `planCoreOfflineComparison.test.ts` und
 * `scripts/planCoreCompare.ts`.
 */

import { EMPTY_RULES, buildCheckedPlan, diffDays, weekdayOf } from "../planCore";
import type { CoreInputs, Weekday } from "../planCore";
import { PROFILES } from "../planCore/__fixtures__/profiles";
import { randomInputs } from "../planCore/__fixtures__/randomInputs";
import { weeklyKmRangeFromKm } from "../onboarding/onboardingPlanInputs";
import { profileToCoreInputs } from "../../api/_lib/planCoreMapping";
import { planMetrics, type PlanMetrics } from "../../api/_lib/planMetrics";

const legacyGenerator = require("../../api/_lib/deterministicPlanGenerator");
const { validatePlanBody } = require("../../api/_lib/inputLimits");

const RACE_KM: Record<CoreInputs["distance"], number> = { "5k": 5, "10k": 10, hm: 21.1, m: 42.2 };
const RACE_LABEL: Record<CoreInputs["distance"], string> = {
  "5k": "5 km",
  "10k": "10 km",
  hm: "Halbmarathon (21,1 km)",
  m: "Marathon (42,2 km)",
};

/** `2027-03-14` → „14.03.2027“ (wie `formatOnboardingDateGerman`, Tag ohne führende Null). */
function germanDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${Number(d)}.${m}.${y}`;
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Kern-Eingaben → Profil, wie es der Wizard (Schritt 9) an den Server schickt. */
export function wizardProfileOf(inputs: CoreInputs): Record<string, unknown> {
  return {
    raceDistanceKm: RACE_KM[inputs.distance],
    raceDistanceLabel: RACE_LABEL[inputs.distance],
    raceGoal: inputs.goalTime ? "time" : "finish",
    raceTargetTime: inputs.goalTime ? clock(inputs.goalTime) : null,
    weeklyKmRange: weeklyKmRangeFromKm(inputs.currentWeeklyKm),
    raceDate: germanDate(inputs.raceDate),
    planStartDate: germanDate(inputs.startYmd),
    planDurationDays: diffDays(inputs.raceDate, inputs.startYmd),
    userPreferences: [],
    runDaysPerWeek: inputs.runDaysPerWeek,
    availableDays: inputs.availableDays.slice(),
    ...(inputs.longRunDay ? { longRunDay: inputs.longRunDay } : {}),
    currentWeeklyKm: inputs.currentWeeklyKm,
    ...(inputs.longestRecentRunKm !== undefined
      ? { longestRecentRunKm: inputs.longestRecentRunKm, longestRecentRunKmIsDefault: false }
      : {}),
    recentRace: inputs.recentRace ?? null,
  };
}

/** Der heutige Pfad ohne Claude: Standardstruktur und -regeln wie im Rückfall von `phasedFullPlanGenerator.js`. */
export function legacyPlanOf(profile: Record<string, unknown>): { workouts: unknown[] } {
  const start = legacyGenerator.parseOnboardingRaceDate(profile.planStartDate);
  const race = legacyGenerator.parseOnboardingRaceDate(profile.raceDate);
  const { totalWeeks } = legacyGenerator.computeWeekStartDates(start, race);
  const structure = legacyGenerator.defaultStructureForWeeks(totalWeeks);
  return legacyGenerator.generateMarathonPlanV2ToRace(
    start,
    race,
    profile.raceGoal,
    profile.raceDistanceKm,
    profile.weeklyKmRange,
    undefined,
    structure.rules,
    structure.phases,
    profile.raceTargetTime,
  );
}

export type ComparisonSide = PlanMetrics & {
  /** Trainingsläufe (ohne Rennen) an Tagen, die der Nutzer nicht verfügbar hat. */
  runsOnUnavailableDays: number;
  /** Wochen vor der Rennwoche mit mehr Läufen als `runDaysPerWeek`. */
  weeksOverRunDays: number;
};

export type ComparisonRow = {
  name: string;
  label: string;
  inputs: CoreInputs;
  mappingOk: boolean;
  coreErrors: number;
  coreWarnings: number;
  /** Kern-Meldungen je `Code/Regel` (errors und warnings), z. B. `I2/q-softened`. */
  coreViolationRules: Record<string, number>;
  core: ComparisonSide | null;
  legacy: ComparisonSide;
};

function sideOf(plan: { workouts?: unknown }, inputs: CoreInputs): ComparisonSide {
  const workouts = (Array.isArray(plan.workouts) ? plan.workouts : []) as Array<Record<string, unknown>>;
  const runs = workouts.filter(
    (w) => w.sport === "run" && w.sessionType !== "rest" && typeof w.km === "number" && w.km > 0 && typeof w.dateIso === "string",
  );
  // Das Rennen liegt am vorgegebenen Renntag, auch wenn der Wochentag sonst nicht verfügbar ist: nicht mitzählen.
  const runsOnUnavailableDays = runs.filter(
    (w) => w.sessionType !== "race" && inputs.availableDays.indexOf(weekdayOf((w.dateIso as string).slice(0, 10)) as Weekday) < 0,
  ).length;
  const perWeek: Record<string, { runs: number; race: boolean }> = {};
  runs.forEach((w) => {
    const ymd = (w.dateIso as string).slice(0, 10);
    const key = String(Math.floor(diffDays(ymd, "2000-01-03") / 7));
    const week = perWeek[key] ?? (perWeek[key] = { runs: 0, race: false });
    week.runs += 1;
    if (w.sessionType === "race") week.race = true;
  });
  const weeksOverRunDays = Object.keys(perWeek).filter(
    (key) => !perWeek[key].race && perWeek[key].runs > inputs.runDaysPerWeek,
  ).length;
  return { ...planMetrics(plan), runsOnUnavailableDays, weeksOverRunDays };
}

export function compareCase(name: string, label: string, inputs: CoreInputs, todayYmd: string): ComparisonRow {
  const profile = validatePlanBody({ profile: wizardProfileOf(inputs) }).payload.profile as Record<string, unknown>;
  const mapped = profileToCoreInputs(profile, todayYmd);
  const legacy = sideOf(legacyPlanOf(profile), inputs);
  if (!mapped.ok) {
    return { name, label, inputs, mappingOk: false, coreErrors: 0, coreWarnings: 0, coreViolationRules: {}, core: null, legacy };
  }
  const { plan, check } = buildCheckedPlan(mapped.inputs, EMPTY_RULES, todayYmd);
  const coreViolationRules: Record<string, number> = {};
  check.violations.forEach((v) => {
    const key = `${v.code}/${v.rule}`;
    coreViolationRules[key] = (coreViolationRules[key] ?? 0) + 1;
  });
  return {
    name,
    label,
    inputs,
    mappingOk: true,
    coreErrors: check.errors,
    coreWarnings: check.warnings,
    coreViolationRules,
    core: sideOf(plan, inputs),
    legacy,
  };
}

export function compareReferenceProfiles(): ComparisonRow[] {
  return PROFILES.map((p) => compareCase(p.name, p.label, p.inputs, p.todayYmd));
}

export const RANDOM_SEED = 20261110;

export function compareRandomProfiles(count: number, seed = RANDOM_SEED): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const { inputs, todayYmd } = randomInputs(seed + i);
    rows.push(compareCase(`R${i + 1}`, `Seed ${seed + i}`, inputs, todayYmd));
  }
  return rows;
}
