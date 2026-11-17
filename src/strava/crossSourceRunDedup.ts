/**
 * Derselbe Lauf aus zwei Quellen zählt einmal: Eine Garmin-Uhr schreibt denselben Lauf oft nach
 * Apple Health (über Garmin Connect) UND nach Strava. Apple Health hat Vorrang (reichere Daten,
 * HealthKit-UUID, und Strava-Daten dürfen nur 7 Tage gehalten werden – Strava API Policy §6.2).
 *
 * Gleich heißt: gleiche Sportart, Start höchstens 5 min auseinander, Distanz höchstens 5 % auseinander.
 * Rein (keine Uhr, kein Speicher); aufgerufen überall, wo Läufe zusammengeführt werden
 * (`mergeHealthRuns`, `loadHealthRunsFromStorage`, `loadHealthWorkouts`).
 */

import type { StoredHealthRun } from "../healthRuns";
import { classifyWorkoutType } from "../appleHealth/workoutTypeClassifier";
import { isStravaSourcedRun } from "./stravaRunSource";

export const CROSS_SOURCE_START_TOLERANCE_MS = 5 * 60 * 1000;
export const CROSS_SOURCE_DISTANCE_TOLERANCE = 0.05;

function knownDistanceMeters(run: StoredHealthRun): number | null {
  if (run.distanceUnknown) return null;
  const m = run.distanceMeters;
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : null;
}

function canonical(run: StoredHealthRun) {
  return classifyWorkoutType(run.workoutType == null ? "" : String(run.workoutType));
}

/**
 * true, wenn ein Apple-Health-Lauf und ein Strava-Lauf dieselbe Aktivität sind.
 * ENTSCHEIDUNG (Anton absegnen): Fehlt einer Seite die Distanz (z. B. Laufband ohne Distanz in Health),
 * reicht der Start (±5 min) bei gleicher Sportart – zwei getrennte Läufe mit fast gleichem Start
 * gibt es praktisch nicht, eine Doppelzählung wäre schlimmer.
 */
export function isSameRunAcrossSources(appleRun: StoredHealthRun, stravaRun: StoredHealthRun): boolean {
  const a = Date.parse(appleRun.startDate);
  const b = Date.parse(stravaRun.startDate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) > CROSS_SOURCE_START_TOLERANCE_MS) return false;
  const ca = canonical(appleRun);
  if (ca === "other" || ca !== canonical(stravaRun)) return false;
  const da = knownDistanceMeters(appleRun);
  const db = knownDistanceMeters(stravaRun);
  if (da == null || db == null) return true;
  return Math.abs(da - db) <= CROSS_SOURCE_DISTANCE_TOLERANCE * Math.max(da, db);
}

/**
 * Entfernt Strava-Läufe, die schon als Apple-Health-Lauf vorliegen. Der Apple-Health-Lauf behält seine
 * Werte (keine Vermischung mit Strava-Daten) und merkt sich die ID des Strava-Duplikats in
 * `mergedRunIds` – damit erkennt die Zuordnung eine Einheit wieder, die schon dem Strava-Lauf
 * zugeordnet war (`applyAppleHealthTrainingSync`).
 *
 * Reihenfolge und Identität aller übrigen Einträge bleiben erhalten; ohne Treffer kommt dieselbe Liste zurück.
 */
export function dedupeAppleHealthAndStravaRuns(runs: StoredHealthRun[]): StoredHealthRun[] {
  if (!Array.isArray(runs) || runs.length < 2) return runs;
  const stravaIdx: number[] = [];
  const appleIdx: number[] = [];
  runs.forEach((run, i) => {
    if (!run) return;
    (isStravaSourcedRun(run) ? stravaIdx : appleIdx).push(i);
  });
  if (stravaIdx.length === 0 || appleIdx.length === 0) return runs;

  // Alle passenden Paare, dann die mit dem kleinsten Startabstand zuerst: jeder Lauf verschmilzt höchstens einmal.
  const pairs: { si: number; ai: number; diff: number }[] = [];
  for (const si of stravaIdx) {
    for (const ai of appleIdx) {
      if (!isSameRunAcrossSources(runs[ai], runs[si])) continue;
      pairs.push({ si, ai, diff: Math.abs(Date.parse(runs[ai].startDate) - Date.parse(runs[si].startDate)) });
    }
  }
  if (pairs.length === 0) return runs;
  pairs.sort((a, b) => a.diff - b.diff || a.si - b.si || a.ai - b.ai);

  const drop = new Set<number>();
  const aliasesByApple = new Map<number, string[]>();
  const usedApple = new Set<number>();
  for (const { si, ai } of pairs) {
    if (drop.has(si) || usedApple.has(ai)) continue;
    usedApple.add(ai);
    drop.add(si);
    aliasesByApple.set(ai, [...(aliasesByApple.get(ai) ?? []), runs[si].runId]);
  }

  const out: StoredHealthRun[] = [];
  runs.forEach((run, i) => {
    if (drop.has(i)) return;
    const aliases = aliasesByApple.get(i);
    if (!aliases) {
      out.push(run);
      return;
    }
    const merged = new Set([...(run.mergedRunIds ?? []), ...aliases]);
    out.push({ ...run, mergedRunIds: Array.from(merged) });
  });
  return out;
}

/**
 * Nach einem Strava-Import: die Strava-Läufe im lokalen Bestand durch den frisch geladenen Stand
 * ersetzen (inkl. der vom Server nach 7 Tagen gelöschten) und erneut gegen Apple Health deduplizieren.
 */
export function replaceStravaRuns(current: StoredHealthRun[], stravaRuns: StoredHealthRun[]): StoredHealthRun[] {
  const keep = current.filter((run) => !isStravaSourcedRun(run));
  const incoming = stravaRuns.filter((run) => isStravaSourcedRun(run));
  const combined = [...keep, ...incoming].sort(
    (a, b) => Date.parse(a.startDate) - Date.parse(b.startDate),
  );
  return dedupeAppleHealthAndStravaRuns(combined);
}
