import type { TrainingPlanV2, WorkoutV2, Intensity } from "../../planV2/types";
import { allow, axis, joinReasons, warn, type ValidationResult } from "./validationResult";
import type { ValidationContext } from "./validationContext";

function startOfIsoWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const offset = (day + 6) % 7; // Mon->0, Sun->6
  d.setDate(d.getDate() - offset);
  return d;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 999;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

export function inferIntensity(w: WorkoutV2): Intensity {
  if (w.intensity) return w.intensity;
  if (w.sessionType === "interval" || w.sessionType === "tempo" || w.sessionType === "race") return "high";
  if (w.sessionType === "long") return "medium";
  return "low";
}

function groupByWeek(workouts: WorkoutV2[]): Map<string, WorkoutV2[]> {
  const map = new Map<string, WorkoutV2[]>();
  for (const w of workouts) {
    const d = new Date(w.dateIso);
    if (!Number.isFinite(d.getTime())) continue;
    const key = ymd(startOfIsoWeekMonday(d));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return map;
}

/**
 * Micro-structure validation for physiological spacing inside each calendar week.
 * Deterministic only; runs after structural rebuild.
 */
export function validateMicroStructure(plan: TrainingPlanV2, context: ValidationContext): ValidationResult {
  const weeks = groupByWeek(plan.workouts || []);

  const warnItems: Array<{ reason: string; severity: number }> = [];

  const phase = context.phase;
  const isTaper = phase === "taper";
  const isPeak = phase === "peak";
  const isBase = phase === "base";

  function pushWarn(reason: string, severity: number) {
    warnItems.push({ reason, severity });
  }

  function isRestWorkout(w: WorkoutV2): boolean {
    return w.sport === "rest" || w.sessionType === "rest";
  }

  const weekEntries = Array.from(weeks.entries());
  for (let wi = 0; wi < weekEntries.length; wi += 1) {
    const weekKey = weekEntries[wi][0];
    const workouts = weekEntries[wi][1];
    const sorted = [...workouts].sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    // Warning checks (week-level)
    const hasRest = sorted.some((w) => w.sport === "rest" || w.sessionType === "rest");
    if (!hasRest) {
      const sev = isTaper ? 65 : isPeak ? 55 : 35;
      pushWarn("Warnung: Diese Woche hat keinen Ruhetag.", sev);
    }

    // Hard sessions density warning: 3 high sessions in 4 days
    const highs = sorted
      .filter((w) => inferIntensity(w) === "high")
      .map((w) => w.dateIso)
      .sort();
    for (let i = 0; i < highs.length; i++) {
      const start = highs[i];
      const end = highs[i + 2];
      if (!end) continue;
      const diff = dayDiff(start, end);
      if (diff >= 0 && diff <= 3) {
        const sev = isTaper ? 85 : isPeak ? 80 : 60;
        pushWarn("Warnung: Drei intensive Einheiten in vier Tagen erhöhen das Verletzungsrisiko.", sev);
        break;
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      if (!next) continue;

      const currInt = inferIntensity(curr);
      const nextInt = inferIntensity(next);
      const diffDays = dayDiff(curr.dateIso, next.dateIso);

      // RULE 1: no back-to-back high intensity on adjacent days (or same day) — warn only; athlete decides.
      if (currInt === "high" && nextInt === "high" && diffDays <= 1) {
        return warn({ micro: axis(95, "Back-to-back intensity: zwei intensive Einheiten hintereinander.") });
      }

      // RULE 1b: recovery after high session (phase-dependent)
      if (currInt === "high" && diffDays === 1 && nextInt !== "low") {
        if (isTaper) {
          return warn({
            micro: axis(95, "Taper: nach intensiver Einheit am Folgetag nur Erholung/locker sinnvoll."),
          });
        }
        const sev = isPeak ? 80 : isBase ? 40 : 55;
        pushWarn("Warnung: Nach einer intensiven Einheit ist ein Erholungstag am nächsten Tag empfehlenswert.", sev);
      }

      // RULE 2: long run spacing (phase-dependent)
      if (curr.sessionType === "long") {
        if (diffDays < 2 && !isRestWorkout(next)) {
          // In taper/peak: tighter spacing → warn by default (athlete may still confirm swaps).
          if (isTaper || isPeak) {
            if (nextInt !== "low") return warn({ micro: axis(92, "Long Run stacking: benötigt mindestens 2 Tage Abstand.") });
          } else {
            if (nextInt === "high")
              return warn({ micro: axis(92, "Long Run: benötigt mindestens 2 Tage Abstand zu einer intensiven Einheit.") });
            if (nextInt === "medium") pushWarn("Warnung: Nach einem Long Run sind 2 lockere Tage oft sinnvoll.", 70);
          }
        }
      }
    }
  }

  const uniq = new Map<string, { reason: string; severity: number }>();
  for (const item of warnItems) {
    if (!uniq.has(item.reason)) uniq.set(item.reason, item);
    else uniq.set(item.reason, { ...item, severity: Math.max(item.severity, uniq.get(item.reason)!.severity) });
  }
  const top = Array.from(uniq.values()).slice(0, 3);
  const reason = joinReasons(top.map((t) => t.reason), " ");
  const score = top.reduce((m, t) => Math.max(m, t.severity), 0);
  const axes = reason ? { micro: axis(score, reason) } : {};
  if (!reason) return allow();
  return score >= 60 ? warn(axes) : allow(axes);
}

