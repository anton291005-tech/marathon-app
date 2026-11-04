import type { CorePlan } from "../planCore";
import type { TrainingPlanV2 } from "./types";

/**
 * Nur Typen, kein Laufzeitcode: Der Build bricht ab, wenn der Plan des Kerns (`src/planCore`) nicht mehr zu
 * `TrainingPlanV2` passt. `src/planCore` darf `src/planV2` nicht importieren, deshalb liegt die Prüfung hier.
 */
type Assert<T extends true> = T;

export type CorePlanIsTrainingPlanV2 = Assert<CorePlan extends TrainingPlanV2 ? true : false>;
