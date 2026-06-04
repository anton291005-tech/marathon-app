import type { WorkoutV2, TrainingPlanV2 } from "../../planV2/types";
import type { WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { aggregateAxes, allow, axis, increaseAxisScore, maxAxisScore, type ValidationResult } from "./validationResult";
import { validateLoadShift } from "./validateLoadShift";
import { validateMicroStructure, inferIntensity } from "./validateMicroStructure";
import { validatePhaseSwap } from "./validatePhaseSwap";
import type { ValidationContext } from "./validationContext";

function localDayKey(dateIso: string): string {
  const d = new Date(dateIso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDaysKey(key: string, deltaDays: number): string {
  const [y0, mo0, d0] = key.split("-").map(Number);
  const dt = new Date(y0, mo0 - 1, d0 + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function workoutsByLocalDay(workouts: WorkoutV2[] | undefined): Map<string, WorkoutV2> {
  const m = new Map<string, WorkoutV2>();
  for (const w of workouts || []) {
    const k = localDayKey(w.dateIso);
    if (!k || m.has(k)) continue;
    m.set(k, w);
  }
  return m;
}

function isRestWorkoutPlan(w: WorkoutV2): boolean {
  return w.sport === "rest" || w.sessionType === "rest";
}

function isAthleteLongRun(w: WorkoutV2): boolean {
  if (isRestWorkoutPlan(w) || w.sport === "bike") return false;
  if (w.sessionType === "long" || w.sessionType === "long_run") return true;
  return typeof w.km === "number" && Number.isFinite(w.km) && w.km >= 15;
}

function isIntervalOrTempoOnly(w: WorkoutV2): boolean {
  return w.sessionType === "interval" || w.sessionType === "tempo";
}

function inferHighIntensity(w: WorkoutV2): boolean {
  return inferIntensity(w) === "high";
}

/**
 * Hinweise nur für UI / Post-confirm — swaps werden dadurch nie geblockt.
 */
export function buildSwapAthleteFacingWarnings(opts: { before: TrainingPlanV2; after: TrainingPlanV2 }): string[] {
  const msgLongBeforeInterval =
    "⚠️ Hinweis: Nach dem Tausch folgt am nächsten Plan-Tag ein Intervall- oder Tempotraining direkt nach einem langen bzw. langen Lauf. Das kann die Erholung beeinträchtigen. Du kannst den Tausch trotzdem durchführen.";
  const msgBackToBackHard =
    "⚠️ Hinweis: Nach dem Tausch stehen zwei intensive Einheiten an aufeinanderfolgenden Tagen. Du kannst den Tausch trotzdem durchführen.";
  const msgRestBufferLost =
    "⚠️ Hinweis: Nach dem Tausch liegt zwischen zwei intensiven Einheiten kein Ruhetag mehr wie zuvor im Plan. Du kannst den Tausch trotzdem durchführen.";

  const out: string[] = [];
  const afterBy = workoutsByLocalDay(opts.after.workouts);

  for (const k of Array.from(afterBy.keys()).sort()) {
    const nextK = addCalendarDaysKey(k, 1);
    if (!afterBy.has(nextK)) continue;
    const a = afterBy.get(k)!;
    const b = afterBy.get(nextK)!;
    if (isAthleteLongRun(a) && isIntervalOrTempoOnly(b)) out.push(msgLongBeforeInterval);
    if (inferHighIntensity(a) && inferHighIntensity(b)) out.push(msgBackToBackHard);
  }

  const beforeBy = workoutsByLocalDay(opts.before.workouts);
  for (const k1 of Array.from(beforeBy.keys()).sort()) {
    const k0 = addCalendarDaysKey(k1, -1);
    const k2 = addCalendarDaysKey(k1, 1);
    if (!beforeBy.has(k0) || !beforeBy.has(k2)) continue;
    const w0 = beforeBy.get(k0)!;
    const w1 = beforeBy.get(k1)!;
    const w2 = beforeBy.get(k2)!;
    if (inferHighIntensity(w0) && isRestWorkoutPlan(w1) && inferHighIntensity(w2)) {
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
  const rs = v.recoverySummary;

  const microRaw = validateMicroStructure(context.after, v);
  const micro: ValidationResult =
    microRaw.status === "block" ? { status: "warn", axes: microRaw.axes || {} } : microRaw;

  // Zone 2 / low-medium equivalence should not be blocked by periodization heuristics,
  // but micro-structure Hinweise dürfen nicht verschluckt werden.
  if (isZone2Equivalent(context.source, context.target) && micro.status === "allow") return allow();

  const results: ValidationResult[] = [];

  if (context.weekPhaseMap) {
    results.push(
      validatePhaseSwap(context.source, context.target, { weekPhaseMap: context.weekPhaseMap, validationContext: v }),
    );
  }
  results.push(validateLoadShift(context.before, context.after, 0.3));

  if (micro.status === "warn") results.push(micro);

  // Recovery influence is continuous (never gated by confidence).
  // decisionScore = basePlanLoad + fatiguePressure * adjustedRecoveryInfluence + microStructurePenalty
  // Here: we compute a recovery-axis severity with basePlanLoad=0, microStructurePenalty=0.
  const basePlanLoad = 0;
  const microStructurePenalty = 0;
  const fatiguePressure = (50 - rs.avgRecovery) / 25; // fatigued => positive, fresh => negative
  const decisionScore = basePlanLoad + fatiguePressure * rs.adjustedRecoveryInfluence + microStructurePenalty;
  const recoveryAxisScore = Math.max(0, Math.min(100, Math.round(35 + decisionScore)));
  const recoveryReason =
    rs.recoveryStatus === "fatigued"
      ? "Recovery: du bist aktuell eher ermüdet."
      : rs.recoveryStatus === "fresh"
        ? "Recovery: du bist aktuell eher frisch."
        : "Recovery: normal.";
  results.push({ status: "allow", axes: { recovery: axis(recoveryAxisScore, recoveryReason) } });

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

