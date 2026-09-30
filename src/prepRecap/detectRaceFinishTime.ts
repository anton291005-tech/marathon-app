/**
 * Zielzeit-VORSCHLAG aus Apple Health — nie still übernommen: Die Uhr-Dauer eines Workouts ist
 * nicht zwingend die Netto-/Chipzeit (Start/Stopp an der Uhr, Pausen). Das Ergebnis wird deshalb
 * immer als unbestätigt behandelt und im UI „laut Apple Health" gekennzeichnet, bis der Athlet es
 * bestätigt oder korrigiert (Rückblick-Schritt).
 *
 * Strava liefert keine Aktivitäten (nur OAuth-Tokens), ist hier also bewusst keine Quelle.
 */

import {
  getStoredHealthRunCanonicalType,
  storedHealthRunDistanceKmNumeric,
  type StoredHealthRun,
} from "../healthRuns";
import { getAppCalendarYmd } from "../core/time/timeSystem";
import { getSessionPlannedDistanceKm } from "../sessionDistance";
import type { PlanSession, SessionLog } from "../marathonPrediction";

export type DetectedRaceFinish = {
  seconds: number;
  distanceKm: number;
  source: "health";
};

const MARATHON_MIN_DISTANCE_KM = 40;
const MIN_DISTANCE_SHARE_OF_RACE = 0.95;

/**
 * Mindestdistanz eines Workouts, damit es als das Rennen gilt: 40 km beim Marathon, bei kürzeren
 * Renndistanzen 95 % davon (sonst würde z. B. ein Halbmarathon-Plan nie einen Treffer liefern).
 */
export function minFinishDistanceKm(raceDistanceKm: number | null | undefined): number {
  if (typeof raceDistanceKm !== "number" || !Number.isFinite(raceDistanceKm) || raceDistanceKm <= 0) {
    return MARATHON_MIN_DISTANCE_KM;
  }
  return Math.min(MARATHON_MIN_DISTANCE_KM, raceDistanceKm * MIN_DISTANCE_SHARE_OF_RACE);
}

function localYmdFromIso(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || !iso) return null;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;
  return getAppCalendarYmd(t);
}

function validSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function detectRaceFinishTime(args: {
  raceSession: PlanSession | null;
  raceYmd: string;
  raceLog: SessionLog | undefined;
  healthRuns: readonly StoredHealthRun[];
  raceDistanceKm?: number | null;
}): DetectedRaceFinish | null {
  const { raceSession, raceYmd, raceLog, healthRuns } = args;
  if (!raceSession) return null;
  const plannedKm = args.raceDistanceKm ?? getSessionPlannedDistanceKm(raceSession);
  const minKm = minFinishDistanceKm(plannedKm);

  // 1) Bereits zugeordneter Health-Lauf an der Race-Session (Auto-Sync oder manuell).
  const assigned = raceLog?.assignedRun;
  if (assigned?.runId && assigned.canonicalActivityType !== "bike") {
    const seconds = validSeconds(assigned.duration);
    const km = assigned.distanceKm;
    if (seconds != null && typeof km === "number" && Number.isFinite(km) && km >= minKm) {
      return { seconds, distanceKm: km, source: "health" };
    }
  }

  // 2) Längster Lauf am lokalen Renntag aus den gespeicherten Health-Workouts.
  let best: DetectedRaceFinish | null = null;
  for (const run of healthRuns ?? []) {
    if (!run || getStoredHealthRunCanonicalType(run) !== "run") continue;
    if (localYmdFromIso(run.startDate) !== raceYmd) continue;
    const km = storedHealthRunDistanceKmNumeric(run);
    const seconds = validSeconds(run.duration);
    if (km == null || km < minKm || seconds == null) continue;
    if (best == null || km > best.distanceKm) best = { seconds, distanceKm: km, source: "health" };
  }
  return best;
}
