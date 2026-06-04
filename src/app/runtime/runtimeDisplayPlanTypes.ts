import type { AiPlanWeek } from "../../lib/ai/types";

/**
 * Display plan row type used after `deriveDisplayPlan` (`useDisplayPlanFromTrainingState`).
 * Alias keeps recovery runtime aligned with SSOT naming without implying `PlanWeek` (base/template) parity.
 */
export type RuntimeDisplayPlan = readonly AiPlanWeek[];
