import type { WorkoutV2, TrainingPlanV2 } from "../../planV2/types";
import type { WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { aggregateAxes, allow, increaseAxisScore, maxAxisScore, type ValidationResult } from "./validationResult";
import { validateLoadShift } from "./validateLoadShift";
import { addDays } from "../../planCore";
import { sessionYmd } from "../../core/time/sessionDate";
import { coreKindOf, easyPaceOfPlan, isHardWorkout, isLongRunWorkout } from "./hardWorkout";
import { validateMicroStructure, inferIntensity } from "./validateMicroStructure";
import { validatePhaseSwap } from "./validatePhaseSwap";
import type { ValidationContext } from "./validationContext";

function workoutsByDay(workouts: WorkoutV2[] | undefined): Map<string, WorkoutV2> {
  const m = new Map<string, WorkoutV2>();
  for (const w of workouts || []) {
    const k = sessionYmd(w);
    if (!k || m.has(k)) continue;
    m.set(k, w);
  }
  return m;
}

function isRestWorkoutPlan(w: WorkoutV2): boolean {
  return w.sport === "rest" || w.sessionType === "rest";
}

function isIntervalOrTempoOnly(w: WorkoutV2): boolean {
  const kind = coreKindOf(w);
  return kind === "I" || kind === "T" || kind === "R" || kind === "M";
}

/**
 * Hinweise nur für UI / Post-confirm — swaps werden dadurch nie geblockt.
 */
export function buildSwapAthleteFacingWarnings(opts: { before: TrainingPlanV2; after: TrainingPlanV2 }): string[] {
  const msgLongBeforeInterval =
    "Hinweis: Nach dem Tausch folgt am nächsten Plan-Tag ein Intervall- oder Tempotraining direkt nach einem langen bzw. langen Lauf. Das kann die Erholung beeinträchtigen. Du kannst den Tausch trotzdem durchführen.";
  const msgBackToBackHard =
    "Hinweis: Nach dem Tausch stehen zwei intensive Einheiten an aufeinanderfolgenden Tagen. Du kannst den Tausch trotzdem durchführen.";
  const msgRestBufferLost =
    "Hinweis: Nach dem Tausch liegt zwischen zwei intensiven Einheiten kein Ruhetag mehr wie zuvor im Plan. Du kannst den Tausch trotzdem durchführen.";

  const out: string[] = [];
  const easyPace = easyPaceOfPlan(opts.after) ?? easyPaceOfPlan(opts.before);
  const isHard = (w: WorkoutV2) => isHardWorkout(w, easyPace);
  const afterBy = workoutsByDay(opts.after.workouts);

  for (const k of Array.from(afterBy.keys()).sort()) {
    const nextK = addDays(k, 1);
    if (!afterBy.has(nextK)) continue;
    const a = afterBy.get(k)!;
    const b = afterBy.get(nextK)!;
    if (isLongRunWorkout(a) && isIntervalOrTempoOnly(b)) out.push(msgLongBeforeInterval);
    if (isHard(a) && isHard(b)) out.push(msgBackToBackHard);
  }

  const beforeBy = workoutsByDay(opts.before.workouts);
  for (const k1 of Array.from(beforeBy.keys()).sort()) {
    const k0 = addDays(k1, -1);
    const k2 = addDays(k1, 1);
    if (!beforeBy.has(k0) || !beforeBy.has(k2)) continue;
    const w0 = beforeBy.get(k0)!;
    const w1 = beforeBy.get(k1)!;
    const w2 = beforeBy.get(k2)!;
    if (isHard(w0) && isRestWorkoutPlan(w1) && isHard(w2)) {
      const a1 = afterBy.get(k1);
      if (!a1 || !isRestWorkoutPlan(a1)) out.push(msgRestBufferLost);
    }
  }

  return Array.from(new Set(out));
}

export function isZone2Equivalent(a: WorkoutV2, b: WorkoutV2): boolean {
  const ai = inferIntensity(a);
  const bi = inferIntensity(b);
  return (ai === "low" || ai === "medium") && (bi === "low" || bi === "medium");
}

export function validateSwap(context: {
  source: WorkoutV2;
  target: WorkoutV2;
  before: TrainingPlanV2;
  after: TrainingPlanV2;
  weekPhaseMap?: Map<string, WeekPhaseMeta> | null;
  validationContext: ValidationContext;
}): ValidationResult {
  const v = context.validationContext;

  const microRaw = validateMicroStructure(context.after, v);
  const micro: ValidationResult =
    microRaw.status === "block" ? { status: "warn", axes: microRaw.axes || {} } : microRaw;

  // Zone 2 / low-medium equivalence should not be blocked by periodization heuristics,
  // but micro-structure Hinweise dürfen nicht verschluckt werden.
  if (isZone2Equivalent(context.source, context.target) && micro.status === "allow") return allow();

  const results: ValidationResult[] = [];

  if (context.weekPhaseMap) {
    results.push(
      validatePhaseSwap(context.source, context.target, {
        weekPhaseMap: context.weekPhaseMap,
        validationContext: v,
        easyPaceSecPerKm: easyPaceOfPlan(context.after) ?? easyPaceOfPlan(context.before),
      }),
    );
  }
  results.push(validateLoadShift(context.before, context.after, 0.3));

  if (micro.status === "warn") results.push(micro);

  return evaluate(results, v);
}

export function evaluate(results: ValidationResult[], context: ValidationContext): ValidationResult {
  // Swaps sind nie hart gesperrt: ehemalige blocks werden zu Hinweisen.
  if (results.some((r) => r.status === "block")) {
    const axes = aggregateAxes(results);
    return { status: "warn", axes };
  }

  let adjusted = results;

  // Load-aware adjustment: if current week is already >120% of average, increase warning severity.
  if (context.currentWeekLoad > context.weeklyAvgLoad * 1.2) {
    adjusted = increaseAxisScore(adjusted, "load", +20);
  }

  const axes = aggregateAxes(adjusted);

  const max = maxAxisScore(axes);
  if (max >= 60) return { status: "warn", axes };
  return { status: "allow", axes };
}

