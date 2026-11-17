/**
 * Zielzeit am Plan (`TrainingPlanV2.meta.goal`) — rein, ohne React/Supabase.
 *
 * Vorrang beim Lesen: `meta.goal` des aktiven Plans → (Altplan ohne `meta.goal`) wie bisher Preferences/Profil.
 * Geschrieben wird `meta.goal` beim Anlegen im Wizard und, sobald die Preferences nachweislich zum aktiven Plan
 * gehören, bei jeder Änderung der Zielzeit (das füllt Altpläne nach). Das Profil-Feld `target_time_seconds`
 * bleibt als Rückfall bestehen und wird weiter geschrieben — kein Datenverlust.
 */

import type { PlanGoalMetaV2, TrainingPlanV2 } from "./types";

/** Eingabe-Text der Zielzeit (bis 32 Zeichen) — der Nutzer tippt ihn, also nicht zu streng. */
function cleanTargetTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > 32) return null;
  return t;
}

export function normalizePlanGoalMeta(raw: unknown): PlanGoalMetaV2 | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.raceGoal !== "time" && r.raceGoal !== "finish") return undefined;
  const targetTime = r.raceGoal === "finish" ? null : cleanTargetTime(r.targetTime);
  return { raceGoal: r.raceGoal, targetTime };
}

export function readPlanGoalMeta(plan: TrainingPlanV2 | null | undefined): PlanGoalMetaV2 | null {
  return normalizePlanGoalMeta(plan?.meta?.goal) ?? null;
}

type GoalPreferences = { raceGoal?: string | null; targetTime?: string | null };

/** Ziel aus den Preferences (Wizard-Ergebnis bzw. Einstellungen): Zielzeit vor Finish-Ziel, wie die Anzeige. */
export function planGoalFromPreferences(prefs: GoalPreferences | null | undefined): PlanGoalMetaV2 {
  const targetTime = cleanTargetTime(prefs?.targetTime);
  if (targetTime) return { raceGoal: "time", targetTime };
  if (prefs?.raceGoal === "finish") return { raceGoal: "finish", targetTime: null };
  return { raceGoal: "time", targetTime: null };
}

export function samePlanGoal(a: PlanGoalMetaV2 | null | undefined, b: PlanGoalMetaV2 | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.raceGoal === b.raceGoal && (a.targetTime ?? null) === (b.targetTime ?? null);
}

/** Plan mit `meta.goal`; dasselbe Objekt, wenn sich nichts ändert. */
export function withPlanGoalMeta(plan: TrainingPlanV2, goal: PlanGoalMetaV2 | null): TrainingPlanV2 {
  const current = readPlanGoalMeta(plan);
  if (samePlanGoal(current, goal)) return plan;
  const meta = { ...(plan.meta ?? {}) };
  if (goal) meta.goal = { raceGoal: goal.raceGoal, targetTime: goal.raceGoal === "finish" ? null : goal.targetTime };
  else delete meta.goal;
  if (Object.keys(meta).length > 0) return { ...plan, meta };
  const copy = { ...plan };
  delete copy.meta;
  return copy;
}

/**
 * Preferences mit dem Ziel des Plans: `targetTime` und `raceGoal` aus `meta.goal`. Dasselbe Objekt, wenn sie
 * schon stimmen. Ohne Zielzeit wird `targetTime` geleert (""), damit keine fremde Profil-Zielzeit stehen bleibt.
 */
export function applyPlanGoalToPreferences<T extends GoalPreferences>(prefs: T, goal: PlanGoalMetaV2): T {
  const nextTarget = goal.raceGoal === "time" && goal.targetTime ? goal.targetTime : "";
  const currentTarget = typeof prefs.targetTime === "string" ? prefs.targetTime.trim() : "";
  const currentGoal = prefs.raceGoal === "finish" ? "finish" : "time";
  if (currentTarget === nextTarget && (currentGoal === goal.raceGoal || nextTarget !== "")) return prefs;
  return { ...prefs, targetTime: nextTarget, raceGoal: goal.raceGoal };
}
