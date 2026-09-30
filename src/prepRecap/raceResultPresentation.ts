/**
 * Anzeige-Regeln für ein gelaufenes Rennen — geteilt von Home-Hero, Leistung und Rückblick.
 *
 * Ein gelaufener Marathon wird immer gefeiert. Ein Abstand zum Ziel erscheint nur, wenn das Ziel
 * erreicht wurde. Bei verpasstem Ziel gibt es bewusst KEIN Δ: Auch ein neutral gefärbtes „+4:07"
 * liest sich als Rückstand. Nur das Weglassen ist sicher nicht als Scheitern formuliert.
 */

import { formatDuration } from "../marathonPrediction";
import { formatPaceGerman } from "../lib/ai/coachRacePrediction";
import { getSessionPlannedDistanceKm } from "../sessionDistance";
import type { PlanSession } from "../marathonPrediction";

const MARATHON_KM = 42.195;

export type RaceFinishDisplay = {
  seconds: number;
  /** false → Vorschlag aus Apple Health, noch nicht vom Athleten bestätigt. */
  confirmed: boolean;
};

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** "2026-09-27" → "27. September 2026"; null bei ungültigem Wert. */
export function formatRaceDateDe(ymd: string | null | undefined): string | null {
  if (typeof ymd !== "string") return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = MONTHS_DE[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])}. ${month} ${m[1]}`;
}

export function formatFinishTime(seconds: number): string {
  return formatDuration(seconds);
}

/** Zusatz hinter einer Zeit, solange sie nur aus Apple Health stammt. */
export function finishTimeSourceNote(finish: RaceFinishDisplay): string | null {
  return finish.confirmed ? null : "laut Apple Health";
}

/**
 * Offizielle Renndistanz für die Pace: Präferenz, sonst Plan-km der Race-Session.
 * 42,2 km im Plan werden als Marathon (42,195 km) gerechnet.
 */
export function resolveRaceDistanceKm(
  raceSession: PlanSession | null,
  preferredKm?: number | null,
): number | null {
  const km =
    typeof preferredKm === "number" && Number.isFinite(preferredKm) && preferredKm > 0
      ? preferredKm
      : raceSession
        ? getSessionPlannedDistanceKm(raceSession)
        : 0;
  if (!(km > 0)) return null;
  if (Math.abs(km - MARATHON_KM) < 0.1) return MARATHON_KM;
  return km;
}

export function formatRacePace(seconds: number, distanceKm: number | null): string | null {
  if (!(distanceKm && distanceKm > 0) || !(seconds > 0)) return null;
  return formatPaceGerman(seconds / distanceKm);
}

export function isGoalReached(finishSeconds: number, goalSeconds: number | null): boolean {
  return goalSeconds != null && goalSeconds > 0 && finishSeconds <= goalSeconds;
}

function formatDelta(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return formatDuration(s);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Nur bei erreichtem Ziel eine Zeile, sonst null (siehe Modulkommentar). */
export function goalReachedLine(finishSeconds: number, goalSeconds: number | null): string | null {
  if (!isGoalReached(finishSeconds, goalSeconds)) return null;
  const delta = (goalSeconds as number) - finishSeconds;
  if (Math.round(delta) === 0) return "Punktlandung auf dein Ziel";
  return `${formatDelta(delta)} unter deinem Ziel`;
}
