/**
 * Planlänge und Phasen (docs/plan-spec.md §4).
 *
 * Wochen sind Kalenderwochen Mo–So; Woche 1 kann angebrochen sein, die Rennwoche endet am Renntag.
 * Der Taper wird rückwärts vom Renntag gelegt, der Rest wird 35/35/30 auf Basis/Aufbau/Spitze verteilt.
 * Die Spec nennt die Spitzen-Phase "Spezifisch", die App "peak".
 */

import { CONFIG } from "./config";
import { addDays, diffDays, isYmd, mondayOf } from "./dates";
import type { CoreInputs, CorePhase, Distance, Ymd } from "./types";

export type PlanCoreErrorCode = "invalid-input" | "plan-too-short";

export type PlanCoreError = Error & { code: PlanCoreErrorCode };

/** Fehler des Kerns mit maschinenlesbarem Code. `detail` enthält nur Feldnamen und Zahlen, nie Nutzerinhalt. */
export function planCoreError(code: PlanCoreErrorCode, detail?: string): PlanCoreError {
  const error = new Error(detail ? `${code}: ${detail}` : code) as PlanCoreError;
  error.name = "PlanCoreError";
  error.code = code;
  return error;
}

export function isPlanCoreError(value: unknown): value is PlanCoreError {
  return value instanceof Error && (value as PlanCoreError).name === "PlanCoreError";
}

export type PhaseInputs = Pick<CoreInputs, "distance" | "raceDate" | "startYmd">;

export type PhaseWeek = {
  /** Wochennummer ab 1. */
  wn: number;
  /** Montag der Woche. */
  startYmd: Ymd;
  /** Erster und letzter Plantag der Woche (Woche 1 ab Planstart, letzte Woche bis zum Renntag). */
  firstDayYmd: Ymd;
  lastDayYmd: Ymd;
  /** Plantage in dieser Woche, 1–7. */
  days: number;
  phase: CorePhase;
};

export type PhasePlan = {
  weeks: PhaseWeek[];
  /** Taper-Wochen inkl. Rennwoche und einer eventuellen Zusatzwoche (kurze Rennwoche). */
  taperWeeks: number;
  /** Wochen vor dem Planbeginn, die über das Maximum der Distanz hinausgehen ("freie Wochen"). */
  freeWeeks: number;
  /** Erster Plantag: der Planstart, bei gekürztem Plan der Montag der ersten Planwoche. */
  effectiveStartYmd: Ymd;
  /** Weniger Wochen als empfohlen (§4): Warnung, kein eigener Abschlag. */
  belowRecommended: boolean;
  phaseWeeks: Readonly<Record<CorePhase, number>>;
};

export function isDistance(value: unknown): value is Distance {
  return CONFIG.scope.distances.value.indexOf(value as Distance) >= 0;
}

/** Wochen vor dem Taper auf Basis/Aufbau/Spitze (jede Phase mindestens eine Woche, sobald genug Restwochen da sind). */
function splitRest(rest: number): { base: number; build: number; peak: number } {
  const { split, minWeeksPerPhase, minRestWeeksForAllPhases } = CONFIG.phases;
  const all = rest >= minRestWeeksForAllPhases.value;
  const minEach = all ? minWeeksPerPhase.value : 0;
  const peak = Math.min(rest, Math.max(minEach, 1, Math.round(rest * split.value.specific)));
  const build = Math.min(rest - peak, Math.max(minEach, Math.round(rest * split.value.build)));
  return { base: rest - peak - build, build, peak };
}

export function planPhases(inputs: PhaseInputs): PhasePlan {
  const { distance, raceDate, startYmd } = inputs;
  if (!isDistance(distance)) throw planCoreError("invalid-input", "distance");
  if (!isYmd(raceDate)) throw planCoreError("invalid-input", "raceDate");
  if (!isYmd(startYmd)) throw planCoreError("invalid-input", "startYmd");
  if (diffDays(raceDate, startYmd) < 0) throw planCoreError("invalid-input", "startYmd-after-raceDate");

  const raceMonday = mondayOf(raceDate);
  let firstMonday = mondayOf(startYmd);
  let calendarWeeks = diffDays(raceMonday, firstMonday) / 7 + 1;

  const hardMin = CONFIG.planLength.hardMinWeeks.value[distance];
  if (calendarWeeks < hardMin) throw planCoreError("plan-too-short", `weeks=${calendarWeeks} min=${hardMin}`);

  const maxWeeks = CONFIG.planLength.maxWeeks.value[distance];
  let freeWeeks = 0;
  let effectiveStartYmd = startYmd;
  if (calendarWeeks > maxWeeks) {
    freeWeeks = calendarWeeks - maxWeeks;
    firstMonday = addDays(raceMonday, -7 * (maxWeeks - 1));
    effectiveStartYmd = firstMonday;
    calendarWeeks = maxWeeks;
  }

  const raceWeekDays = diffDays(raceDate, raceMonday) + 1;
  let taperWeeks = CONFIG.phases.taperWeeks.value[distance];
  if (raceWeekDays < CONFIG.phases.shortRaceWeekDays.value) taperWeeks += 1;
  taperWeeks = Math.min(taperWeeks, calendarWeeks - 1);

  const { base, build } = splitRest(calendarWeeks - taperWeeks);

  const weeks: PhaseWeek[] = [];
  for (let index = 0; index < calendarWeeks; index += 1) {
    const monday = addDays(firstMonday, index * 7);
    const firstDayYmd = index === 0 ? effectiveStartYmd : monday;
    const lastDayYmd = index === calendarWeeks - 1 ? raceDate : addDays(monday, 6);
    let phase: CorePhase = "peak";
    if (index >= calendarWeeks - taperWeeks) phase = "taper";
    else if (index < base) phase = "base";
    else if (index < base + build) phase = "build";
    weeks.push({
      wn: index + 1,
      startYmd: monday,
      firstDayYmd,
      lastDayYmd,
      days: diffDays(lastDayYmd, firstDayYmd) + 1,
      phase,
    });
  }

  const phaseWeeks: Record<CorePhase, number> = { base: 0, build: 0, peak: 0, taper: 0 };
  weeks.forEach((week) => {
    phaseWeeks[week.phase] += 1;
  });

  return {
    weeks,
    taperWeeks,
    freeWeeks,
    effectiveStartYmd,
    belowRecommended: calendarWeeks < CONFIG.planLength.recommendedWeeks.value[distance].min,
    phaseWeeks,
  };
}
