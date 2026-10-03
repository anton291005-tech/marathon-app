/**
 * Coach-Kontext nach Plan-Ende: „Vorbereitung abgeschlossen" + Rennergebnis statt aktueller Woche.
 *
 * Keine eigene Abschluss-Definition — der Zustand kommt aus `getPrepCompletionState` (derselbe wie
 * der Abschluss-Hero), „gelaufen" und Erholungsfenster aus `recapRaceWasRun` + `isWithinRecoveryWindow`
 * (dieselbe Bedingung wie das Outro des Rückblicks). Alle Felder sind höchstens tagesgenau: der Block
 * landet im gecachten Teil des Coach-Prompts und darf sich nur mit dem Planzustand ändern, nicht pro Call.
 */

import { isWithinRecoveryWindow, recapRaceWasRun } from "../../components/prepRecap/buildRecapSlides";
import type { PrepRecapStats } from "../../prepRecap/buildPrepRecapSnapshot";
import { formatGoalLabel, type PrepCompletionState } from "../../prepRecap/prepCompletionState";
import { formatFinishTime, formatRacePace } from "../../prepRecap/raceResultPresentation";

/**
 * `recovery`: Rennen gelaufen und höchstens 14 Tage her. `ready_for_new_prep`: Rennen gelaufen, Fenster
 * vorbei. `plan_over`: Plan vorbei, aber kein gelaufenes Rennen bekannt — weder Erholung noch Ergebnis.
 */
export type CoachPrepFocus = "recovery" | "ready_for_new_prep" | "plan_over";

export type CoachPrepStatus = {
  status: "completed";
  completedBy: "race_done" | "date_passed" | "plan_ended";
  raceYmd: string;
  raceName: string | null;
  /** Zeit bekannt oder Rennen abgehakt (wie im Rückblick); false bei `plan_ended` und „nur Datum vorbei". */
  raceRun: boolean;
  result: {
    finishTime: string | null;
    finishTimeSeconds: number | null;
    /** false: Zeit ist nur ein Vorschlag aus Apple Health. */
    finishTimeConfirmed: boolean;
    goal: string | null;
    goalSeconds: number | null;
    pacePerKm: string | null;
    distanceKm: number | null;
  };
  focus: CoachPrepFocus;
};

export function buildCoachPrepStatus(args: {
  completion: PrepCompletionState;
  /** Zeit des aktiven Plans (Snapshot bzw. Health-Vorschlag) — nie die eines archivierten Plans. */
  finish: { seconds: number; confirmed: boolean } | null;
  goalSeconds: number | null;
  raceDistanceKm: number | null;
  todayYmd: string;
}): CoachPrepStatus | null {
  const { completion, finish, goalSeconds, raceDistanceKm, todayYmd } = args;
  if (completion.status !== "completed") return null;
  const raceRun = recapRaceWasRun(
    { race: { completedBy: completion.completedBy } } as PrepRecapStats,
    finish ? finish.seconds : null,
  );
  return {
    status: "completed",
    completedBy: completion.completedBy,
    raceYmd: completion.raceYmd,
    raceName: completion.raceName,
    raceRun,
    result: {
      finishTime: finish ? formatFinishTime(finish.seconds) : null,
      finishTimeSeconds: finish ? finish.seconds : null,
      finishTimeConfirmed: finish ? finish.confirmed : false,
      goal: goalSeconds != null ? formatGoalLabel(goalSeconds) : null,
      goalSeconds,
      pacePerKm: finish ? formatRacePace(finish.seconds, raceDistanceKm) : null,
      distanceKm: raceDistanceKm,
    },
    focus: !raceRun
      ? "plan_over"
      : isWithinRecoveryWindow(completion.raceYmd, todayYmd)
        ? "recovery"
        : "ready_for_new_prep",
  };
}
