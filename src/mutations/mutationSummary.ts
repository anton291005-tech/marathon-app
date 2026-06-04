import type { PlanPatch } from "../lib/ai/types";
import type { TrainingPlanV2 } from "../planV2/types";
import { normalizePlanPatchesForApply } from "./normalizePlanPatches";

/** Compact, sort-stable fingerprint for mutation logs / support (not crypto). */
export function trainingPlanV2MutationFingerprint(plan: TrainingPlanV2): string {
  if (!plan?.workouts?.length) return "";
  return plan.workouts
    .map((w) => `${w.id}|${typeof w.dateIso === "string" ? w.dateIso.slice(0, 10) : "?"}`)
    .sort()
    .join(";");
}

export type PlanMutationSummary = {
  kind: "swap_workouts" | "plan_patches" | "replace_plan_v2" | "unknown";
  beforeFp: string;
  afterFp: string;
  patchSessionCount?: number;
};

export function summarizeTrainingPlanV2PatchMutation(args: {
  before: TrainingPlanV2;
  afterPlan: TrainingPlanV2;
  patches?: PlanPatch[];
}): PlanMutationSummary {
  const norm = args.patches?.length ? normalizePlanPatchesForApply(args.patches) : [];
  return {
    kind: "plan_patches",
    beforeFp: trainingPlanV2MutationFingerprint(args.before),
    afterFp: trainingPlanV2MutationFingerprint(args.afterPlan),
    patchSessionCount: norm.length,
  };
}
