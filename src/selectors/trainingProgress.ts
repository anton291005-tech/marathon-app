import type { PlanSession, SessionLog } from "../marathonPrediction";
import { computeTrainableWholePlanProgressPct } from "../lib/training/progressCalculation";

/**
 * Single source of truth for training progress % (Home Ring, KPI «Plan», Share Snapshot, Legacy Plan1).
 * Session-basiert: erledigte trainierbare Einheiten / Gesamtzahl (Keine Ruhetage), nicht KM- und nicht datums-/Kalender-antizipiert.
 */
export function computeTrainingProgressPct(args: {
  planSessions: PlanSession[];
  logs: Record<string, SessionLog | undefined>;
}): number {
  return computeTrainableWholePlanProgressPct(args.planSessions || [], args.logs || {});
}

