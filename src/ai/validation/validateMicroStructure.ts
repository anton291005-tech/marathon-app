import type { TrainingPlanV2, WorkoutV2, Intensity } from "../../planV2/types";
import { diffDays, mondayOf } from "../../planCore";
import { sessionYmd } from "../../core/time/sessionDate";
import { easyPaceOfPlan, isEasyWorkout, isHardWorkout, isLongRunWorkout } from "./hardWorkout";
import { allow, axis, joinReasons, warn, type ValidationResult } from "./validationResult";
import type { ValidationContext } from "./validationContext";

function isRestWorkout(w: WorkoutV2): boolean {
  return w.sport === "rest" || w.sessionType === "rest";
}

/** Grobe Belastungsstufe für Anzeige und Umwandlung; „hart“ im Sinn der Validatoren ist `isHardWorkout`, nicht `"high"`. */
export function inferIntensity(w: WorkoutV2): Intensity {
  if (w.intensity) return w.intensity;
  if (w.sessionType === "interval" || w.sessionType === "tempo" || w.sessionType === "race") return "high";
  if (w.sessionType === "long") return "medium";
  return "low";
}

/**
 * Nicht locker, aber nicht zwingend hart (z. B. kurzer Long Run): weder Kern-Art E/REC/MLR/Ruhe noch ausdrücklich
 * `intensity: "low"`. Die gesetzte Intensität bleibt maßgeblich, damit Altpläne ihre bisherige Einstufung behalten.
 */
function isDemanding(w: WorkoutV2): boolean {
  return !isEasyWorkout(w) && inferIntensity(w) !== "low";
}

type DatedWorkout = { workout: WorkoutV2; ymd: string; hard: boolean };

/**
 * Micro-structure validation for physiological spacing (Warnungen bei Nutzer-Änderungen, blockiert nie).
 * „Hart“ ist die Kern-Definition (`isHardSession`, Spec §1). Die Paare werden über den ganzen Plan gebildet, nicht je
 * Kalenderwoche, damit auch Sonntag → Montag der Folgewoche (und der Jahreswechsel) geprüft wird. Der Tag kommt aus
 * `dateIso`, nie aus einem Label. Deterministic only; runs after structural rebuild.
 */
export function validateMicroStructure(plan: TrainingPlanV2, context: ValidationContext): ValidationResult {
  const easyPace = easyPaceOfPlan(plan);
  const dated: DatedWorkout[] = [];
  for (const workout of plan.workouts || []) {
    const ymd = sessionYmd(workout);
    if (ymd) dated.push({ workout, ymd, hard: isHardWorkout(workout, easyPace) });
  }
  dated.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.workout.dateIso.localeCompare(b.workout.dateIso));

  const weeks = new Map<string, DatedWorkout[]>();
  for (const item of dated) {
    const key = mondayOf(item.ymd);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(item);
  }

  const warnItems: Array<{ reason: string; severity: number }> = [];

  const phase = context.phase;
  const isTaper = phase === "taper";
  const isPeak = phase === "peak";
  const isBase = phase === "base";

  function pushWarn(reason: string, severity: number) {
    warnItems.push({ reason, severity });
  }

  // Week-level warning: no rest day.
  for (const items of Array.from(weeks.values())) {
    const hasRest = items.some(({ workout: w }) => w.sport === "rest" || w.sessionType === "rest");
    if (!hasRest) {
      const sev = isTaper ? 65 : isPeak ? 55 : 35;
      pushWarn("Warnung: Diese Woche hat keinen Ruhetag.", sev);
    }
  }

  // Hard sessions density warning: 3 hard sessions in 4 days (über Wochengrenzen).
  const hardDays = dated.filter((d) => d.hard).map((d) => d.ymd);
  for (let i = 0; i + 2 < hardDays.length; i++) {
    const diff = diffDays(hardDays[i + 2], hardDays[i]);
    if (diff >= 0 && diff <= 3) {
      const sev = isTaper ? 85 : isPeak ? 80 : 60;
      pushWarn("Warnung: Drei intensive Einheiten in vier Tagen erhöhen das Verletzungsrisiko.", sev);
      break;
    }
  }

  for (let i = 0; i + 1 < dated.length; i++) {
    const curr = dated[i];
    const next = dated[i + 1];
    const gap = diffDays(next.ymd, curr.ymd);

    // RULE 1: no back-to-back hard sessions on adjacent days (or same day), also Sunday → Monday — warn only.
    if (curr.hard && next.hard && gap <= 1) {
      return warn({ micro: axis(95, "Back-to-back intensity: zwei intensive Einheiten hintereinander.") });
    }

    // RULE 1b: recovery after a hard session (phase-dependent): next day should be easy.
    if (curr.hard && gap === 1 && isDemanding(next.workout)) {
      if (isTaper) {
        return warn({
          micro: axis(95, "Taper: nach intensiver Einheit am Folgetag nur Erholung/locker sinnvoll."),
        });
      }
      const sev = isPeak ? 80 : isBase ? 40 : 55;
      pushWarn("Warnung: Nach einer intensiven Einheit ist ein Erholungstag am nächsten Tag empfehlenswert.", sev);
    }

    // RULE 2: long run spacing (phase-dependent)
    if (isLongRunWorkout(curr.workout) && gap < 2 && !isRestWorkout(next.workout)) {
      // In taper/peak: tighter spacing → warn by default (athlete may still confirm swaps).
      if (isTaper || isPeak) {
        if (isDemanding(next.workout)) return warn({ micro: axis(92, "Long Run stacking: benötigt mindestens 2 Tage Abstand.") });
      } else {
        if (next.hard)
          return warn({ micro: axis(92, "Long Run: benötigt mindestens 2 Tage Abstand zu einer intensiven Einheit.") });
        if (isDemanding(next.workout)) pushWarn("Warnung: Nach einem Long Run sind 2 lockere Tage oft sinnvoll.", 70);
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

