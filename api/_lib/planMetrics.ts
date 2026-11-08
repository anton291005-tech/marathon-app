/**
 * Kennzahlen eines fertigen Plans (`TrainingPlanV2`-Form), gleich gerechnet für den Plan-Kern und den heutigen
 * Generator. Nur Zahlen, keine Texte oder Daten: dürfen ins Log (Umbauplan Schritt 10) und in den Offline-Vergleich.
 */

import { mondayOf } from "../../src/planCore";

export type MetricWorkout = { dateIso?: unknown; sport?: unknown; sessionType?: unknown; km?: unknown };

export type PlanMetrics = {
  weeks: number;
  totalKm: number;
  /** Größte Woche ohne die km des Rennens. */
  peakWeekKm: number;
  longestRunKm: number;
  longRunsAtLeast30: number;
  /** Ø tempo/interval-Einheiten je Woche vor der Rennwoche. */
  qPerWeek: number;
  maxRunDaysPerWeek: number;
  /** Woche vor der Rennwoche in % der größten Woche. */
  preRaceWeekPct: number | null;
  /** Rennwoche ohne Rennen in % der größten Woche. */
  raceWeekPct: number | null;
};

type Week = { monday: string; km: number; runs: number; q: number; hasRace: boolean };

const r1 = (value: number): number => Math.round(value * 10) / 10;

function isRun(workout: MetricWorkout): boolean {
  return workout.sport === "run" && workout.sessionType !== "rest" && typeof workout.km === "number" && workout.km > 0;
}

export function planMetrics(plan: { workouts?: unknown }): PlanMetrics {
  const workouts = (Array.isArray(plan.workouts) ? plan.workouts : []) as MetricWorkout[];
  const byWeek: Record<string, Week> = {};
  let totalKm = 0;
  let longestRunKm = 0;
  let longRunsAtLeast30 = 0;

  workouts.forEach((workout) => {
    if (typeof workout.dateIso !== "string" || workout.dateIso.length < 10) return;
    const monday = mondayOf(workout.dateIso.slice(0, 10));
    const week = byWeek[monday] ?? (byWeek[monday] = { monday, km: 0, runs: 0, q: 0, hasRace: false });
    if (!isRun(workout)) return;
    const km = workout.km as number;
    totalKm += km;
    week.runs += 1;
    if (workout.sessionType === "race") {
      week.hasRace = true;
      return;
    }
    week.km += km;
    if (workout.sessionType === "tempo" || workout.sessionType === "interval") week.q += 1;
    if (workout.sessionType === "long") {
      longestRunKm = Math.max(longestRunKm, km);
      if (km >= 30) longRunsAtLeast30 += 1;
    }
  });

  const weeks = Object.keys(byWeek)
    .sort()
    .map((key) => byWeek[key]);
  const peakWeekKm = weeks.reduce((max, week) => Math.max(max, week.km), 0);
  const raceIndex = weeks.findIndex((week) => week.hasRace);
  const beforeRace = raceIndex >= 0 ? weeks.slice(0, raceIndex) : weeks;
  const qPerWeek = beforeRace.length ? beforeRace.reduce((sum, week) => sum + week.q, 0) / beforeRace.length : 0;
  const pct = (km: number): number | null => (peakWeekKm > 0 ? Math.round((km / peakWeekKm) * 100) : null);

  return {
    weeks: weeks.length,
    totalKm: r1(totalKm),
    peakWeekKm: r1(peakWeekKm),
    longestRunKm: r1(longestRunKm),
    longRunsAtLeast30,
    qPerWeek: r1(qPerWeek),
    maxRunDaysPerWeek: weeks.reduce((max, week) => Math.max(max, week.runs), 0),
    preRaceWeekPct: raceIndex > 0 ? pct(weeks[raceIndex - 1].km) : null,
    raceWeekPct: raceIndex >= 0 ? pct(weeks[raceIndex].km) : null,
  };
}
