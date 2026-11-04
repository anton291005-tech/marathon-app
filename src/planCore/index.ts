/**
 * Öffentliche Schnittstelle des deterministischen Plan-Kerns.
 * Stand: Typen, Config, Datums-Helfer, Phasen (`planPhases`), Wochenumfang (`planVolume`) und Form/Pace (`buildPaceProfile`). `buildPlan`,
 * `checkCorePlan` usw. kommen mit den Folgeschritten (docs/plan-core-plan.md). `random.ts` ist absichtlich nicht exportiert (nur Tests).
 */

export * from "./types";
export { CONFIG, CONFIG_VERSION } from "./config";
export type { Param, ParamSource, Range } from "./config";
export {
  WEEKDAYS,
  addDays,
  dateInWeek,
  diffDays,
  dowOf,
  isYmd,
  mondayOf,
  weekIndexOf,
  weekdayOf,
} from "./dates";
export { planPhases, isPlanCoreError, planCoreError } from "./phases";
export type { PhasePlan, PhaseWeek, PhaseInputs, PlanCoreError, PlanCoreErrorCode } from "./phases";
export { planVolume } from "./volume";
export type { PlanVolume, PlanVolumeNote, PlanVolumeWeek, VolumeInputs, VolumeOptions } from "./volume";
export {
  buildPaceProfile,
  formatPace,
  formatPaceRange,
  predictRaceSeconds,
  trainingPaces,
  vdotFromRace,
  vdotPenalty,
} from "./pace";
export type {
  BeginnerPaces,
  GoalInfo,
  PaceCode,
  PaceInputs,
  PaceNote,
  PaceProfile,
  RacePace,
  RecentRaceProblem,
  TrainingPaces,
} from "./pace";
