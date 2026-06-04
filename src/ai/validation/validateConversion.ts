import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { deepClone } from "../../core/deepClone";
import type { TrainingPlanV2, WeekV2, WorkoutV2 } from "../../planV2/types";
import { toPlanWeeks } from "../../planV2/toPlanWeeks";
import { getWeekPlannedLoadKm } from "../../weeklyAnalysis";
import { allow, axis, warn, type ValidationResult } from "./validationResult";
import { validateLoadShift } from "./validateLoadShift";

const DEFAULT_PRIOR_WEEK_RATIO = 1.2;

function roundKm(n: number): number {
  return Math.round(n * 10) / 10;
}

function weekRunningKmV2(week: WeekV2): number {
  let sum = 0;
  for (const w of week.workouts) {
    if (w.sport === "rest" || w.sessionType === "rest") continue;
    if (w.sport === "bike" || w.sessionType === "bike") continue;
    if (w.sessionType === "strength") continue;
    sum += typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0;
  }
  return roundKm(sum);
}

function findWeekStartForSession(plan: TrainingPlanV2, sessionId: string): string | null {
  for (const week of plan.weeks) {
    if (week.workouts.some((w) => w.id === sessionId)) return week.startIso;
  }
  return null;
}

function previousWeekStart(plan: TrainingPlanV2, weekStartIso: string): string | null {
  const sorted = [...plan.weeks].sort((a, b) => a.startIso.localeCompare(b.startIso));
  const idx = sorted.findIndex((w) => w.startIso === weekStartIso);
  if (idx <= 0) return null;
  return sorted[idx - 1]?.startIso ?? null;
}

export function applyConversionToPlan(
  before: TrainingPlanV2,
  sessionId: string,
  proposed: Partial<WorkoutV2>,
): TrainingPlanV2 {
  const metaByWeekStart = new Map(before.weeks.map((w) => [w.startIso, w.meta] as const));
  const updatedWorkouts = before.workouts.map((w) =>
    w.id === sessionId
      ? {
          ...w,
          ...proposed,
          sport: proposed.sport ?? w.sport,
          sessionType: proposed.sessionType ?? w.sessionType,
          km: typeof proposed.km === "number" ? proposed.km : w.km,
        }
      : w,
  );
  return rebuildPlanFromWorkouts({ workouts: updatedWorkouts, metaByWeekStart });
}

export type ConversionLoadWarning = {
  weekStartIso: string;
  priorWeekStartIso: string;
  afterRunningKm: number;
  priorWeekRunningKm: number;
  ratio: number;
};

export function computeConversionPriorWeekWarnings(
  before: TrainingPlanV2,
  after: TrainingPlanV2,
  sessionId: string,
  priorWeekRatioThreshold = DEFAULT_PRIOR_WEEK_RATIO,
): ConversionLoadWarning[] {
  const weekStart = findWeekStartForSession(after, sessionId);
  if (!weekStart) return [];

  const priorStart = previousWeekStart(before, weekStart);
  if (!priorStart) return [];

  const afterWeek = after.weeks.find((w) => w.startIso === weekStart);
  const priorWeek = before.weeks.find((w) => w.startIso === priorStart);
  if (!afterWeek || !priorWeek) return [];

  const afterRunningKm = weekRunningKmV2(afterWeek);
  const priorWeekRunningKm = weekRunningKmV2(priorWeek);
  if (priorWeekRunningKm <= 0) return [];

  const ratio = afterRunningKm / priorWeekRunningKm;
  if (ratio <= priorWeekRatioThreshold) return [];

  return [
    {
      weekStartIso: weekStart,
      priorWeekStartIso: priorStart,
      afterRunningKm,
      priorWeekRunningKm,
      ratio,
    },
  ];
}

/**
 * Load-Shift nach Konvertierung — warnt, blockiert nie.
 * Prüft (1) Wochenanstieg innerhalb der betroffenen Woche und (2) >120 % der Vorwoche (Lauf-km).
 */
export function validateConversion(
  before: TrainingPlanV2,
  after: TrainingPlanV2,
  sessionId: string,
  opts?: { priorWeekRatioThreshold?: number; intraWeekMaxIncreaseRatio?: number },
): ValidationResult {
  const priorThreshold = opts?.priorWeekRatioThreshold ?? DEFAULT_PRIOR_WEEK_RATIO;
  const intraRatio = opts?.intraWeekMaxIncreaseRatio ?? 0.3;

  const intra = validateLoadShift(before, after, intraRatio);
  const priorWarnings = computeConversionPriorWeekWarnings(before, after, sessionId, priorThreshold);

  const axes = { ...intra.axes };
  if (priorWarnings.length > 0) {
    const top = priorWarnings[0];
    const pct = Math.round(top.ratio * 100);
    axes.load = axis(
      Math.max(axes.load?.score ?? 55, 65),
      `Achtung: Lauf-km dieser Woche (${top.afterRunningKm} km) liegen bei ${pct}% der Vorwoche (${top.priorWeekRunningKm} km) — Belastung im Blick behalten.`,
    );
  }

  const hasWarnAxis = Object.values(axes).some((a) => a && a.score >= 50);
  if (intra.status === "warn" || priorWarnings.length > 0) {
    return warn(axes);
  }
  return hasWarnAxis ? warn(axes) : allow(axes);
}

/** UI-Hinweise für Preview / Post-Confirm (kein Block). */
export function buildConversionAthleteFacingWarnings(
  before: TrainingPlanV2,
  after: TrainingPlanV2,
  sessionId: string,
): string[] {
  const out: string[] = [];
  const validation = validateConversion(before, after, sessionId);
  const loadReason = validation.axes.load?.reason;
  if (loadReason) {
    out.push(`⚠️ Hinweis: ${loadReason} Du kannst die Konvertierung trotzdem durchführen.`);
  }

  const weekStart = findWeekStartForSession(after, sessionId);
  if (weekStart) {
    const beforeWeek = before.weeks.find((w) => w.startIso === weekStart);
    const afterWeek = after.weeks.find((w) => w.startIso === weekStart);
    if (beforeWeek && afterWeek) {
      const runBefore = weekRunningKmV2(beforeWeek);
      const runAfter = weekRunningKmV2(afterWeek);
      if (runAfter > runBefore + 0.5) {
        out.push(
          `ℹ️ Wochen-Lauf-km: ${runBefore} → ${runAfter} km (Rad-Anteil entfällt in der Lauf-Summe).`,
        );
      }

      const weekIdx = before.weeks.findIndex((w) => w.startIso === weekStart);
      if (weekIdx >= 0) {
        const beforePlanWeeks = toPlanWeeks(before);
        const afterPlanWeeks = toPlanWeeks(after);
        const loadBefore = getWeekPlannedLoadKm(beforePlanWeeks[weekIdx]!);
        const loadAfter = getWeekPlannedLoadKm(afterPlanWeeks[weekIdx]!);
        if (Math.abs(loadAfter - loadBefore) > 0.5) {
          out.push(`ℹ️ Trainingsvolumen (Lauf+Rad): ${loadBefore} → ${loadAfter} km.`);
        }
      }
    }
  }

  return Array.from(new Set(out));
}

export function buildAfterConversionPlanFromPartial(
  before: TrainingPlanV2,
  sessionId: string,
  proposed: Partial<WorkoutV2>,
): TrainingPlanV2 {
  return applyConversionToPlan(deepClone(before), sessionId, proposed);
}
