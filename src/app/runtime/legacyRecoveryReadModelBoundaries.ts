import type { AiPlanWeek } from "../../lib/ai/types";
import type { PlanWeek } from "../../marathonPrediction";
import type { RecoveryDailyRow } from "../../recovery/recoveryTypes";

import type { RuntimeDisplayPlan } from "./runtimeDisplayPlanTypes";

/**
 * LEGACY BOUNDARY: downstream expects mutable array; do not mutate in upstream.
 *
 * Recovery helpers (`weeklyTrainingStressIndex`, `buildDailyTrainingLoadByDate`, `getRecoveryDomainState`, …)
 * are typed against marathon `PlanWeek[]`; display rows are `AiPlanWeek` after `deriveDisplayPlan`.
 */
export function asLegacyPlanWeeksMutable(displayPlan: RuntimeDisplayPlan): PlanWeek[] {
  return displayPlan as unknown as PlanWeek[];
}

/**
 * LEGACY BOUNDARY: downstream expects mutable array; do not mutate in upstream.
 *
 * Fingerprints / domain APIs historically took mutable `RecoveryDailyRow[]`; runtime passes readonly snapshots.
 */
export function asLegacyRecoveryDailyRowsMutable(rows: readonly RecoveryDailyRow[]): RecoveryDailyRow[] {
  return rows as RecoveryDailyRow[];
}

/**
 * LEGACY BOUNDARY: downstream expects `PlanWeek` metrics shape; do not mutate in upstream.
 *
 * Bridges one display-plan week row into `PlanWeek`-typed recovery load helpers (structural overlap only).
 */
export function asLegacyPlanWeekFromDisplaySlice(week: AiPlanWeek | undefined): PlanWeek {
  return week as unknown as PlanWeek;
}
