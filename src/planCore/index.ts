/**
 * Öffentliche Schnittstelle des deterministischen Plan-Kerns.
 * Gerüst (Schritt 1): Typen, Config und Datums-Helfer. `buildPlan`, `checkCorePlan` usw. kommen mit den
 * Folgeschritten (docs/plan-core-plan.md). `random.ts` ist absichtlich nicht exportiert (nur Tests).
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
