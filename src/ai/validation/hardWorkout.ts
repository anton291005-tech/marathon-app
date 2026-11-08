import { buildPaceProfile, isHardSession, type CoreKind } from "../../planCore";
import { getAppTodayYmd } from "../../core/time/timeSystem";
import type { TrainingPlanV2, WorkoutV2 } from "../../planV2/types";

/**
 * Brücke zwischen `WorkoutV2` und der Kern-Definition „harte Einheit“ (`isHardSession`, docs/plan-spec.md §1).
 * Die Validatoren für Nutzer-Änderungen (Tausch, Kalender-Umverteilung) dürfen nichts anderes als „hart“ zählen
 * als der Plan-Kern, sonst laufen Warnung und Invariante I6 auseinander.
 */

/** Pläne ohne `kind` (Altpläne, Importe): Kern-Art aus dem App-Typ, so grob wie `mapSessionType` umgekehrt. */
const KIND_OF_SESSION_TYPE: Readonly<Record<string, CoreKind>> = {
  rest: "REST",
  race: "RACE",
  interval: "I",
  tempo: "T",
  long: "LR",
  long_run: "LR",
  easy: "E",
};

/** Kern-Art der Einheit; `null` für alles, was kein Lauf ist (Rad, Kraft, Schwimmen) oder nicht zuordenbar ist. */
export function coreKindOf(workout: WorkoutV2): CoreKind | null {
  if (workout.sport === "rest") return "REST";
  if (workout.sport !== "run") return null;
  if (workout.kind) return workout.kind;
  return KIND_OF_SESSION_TYPE[workout.sessionType] ?? null;
}

/**
 * E-Pace (s/km) des Plans, soweit aus `meta.core.inputs` ableitbar. Ohne sie ist die Dauer eines Long Runs unbekannt
 * und er zählt (wie im Kern bei fehlender Angabe) nicht als hart.
 */
export function easyPaceOfPlan(plan: Pick<TrainingPlanV2, "meta"> | null | undefined): number | undefined {
  const inputs = plan?.meta?.core?.inputs;
  if (!inputs) return undefined;
  try {
    const secPerKm = buildPaceProfile(inputs, getAppTodayYmd()).paces.E;
    return Number.isFinite(secPerKm) && secPerKm > 0 ? secPerKm : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Harte Einheit nach Kern-Definition. Die Dauer kommt aus `km` × E-Pace. Die km bei M-Pace stehen nicht in `WorkoutV2`;
 * ein reines M und ein LR+M unter der Long-Run-Schwelle gelten deshalb als nicht hart (Kern-Regel: ohne Zahl nicht hart).
 */
export function isHardWorkout(workout: WorkoutV2, easyPaceSecPerKm?: number): boolean {
  const kind = coreKindOf(workout);
  if (kind === null) return false;
  const durationMinutes =
    easyPaceSecPerKm !== undefined && Number.isFinite(workout.km) ? (workout.km * easyPaceSecPerKm) / 60 : undefined;
  return isHardSession({ kind, durationMinutes });
}

/** Long Run im Sinn des Kerns: LR oder LR+M. Der MLR ist kein Long Run. */
export function isLongRunWorkout(workout: WorkoutV2): boolean {
  const kind = coreKindOf(workout);
  return kind === "LR" || kind === "LR+M";
}

/** Locker im Sinn des Kerns: Ruhe, Nicht-Lauf, REC, E und MLR. */
export function isEasyWorkout(workout: WorkoutV2): boolean {
  const kind = coreKindOf(workout);
  return kind === null || kind === "REST" || kind === "REC" || kind === "E" || kind === "MLR";
}
