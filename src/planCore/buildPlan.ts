/**
 * Fertiger Plan (Schritt 7b): `SessionPlan` → `CorePlan` (= `TrainingPlanV2`, siehe `src/planV2/planCoreCompat.ts`).
 *
 * Form so, dass `normalizeTrainingPlan` den Plan unverändert lässt (Vertragstest):
 * - eine Einheit je Plantag, Ruhetage als `rest`-Workouts; ID `pc-<ymd>-<kind>`; `dateIso` = Mittag UTC des Plantags
 * - Woche: `startIso` = Montag, `totalKm` = Summe der Lauf-km auf 0,1 km gerundet (wie `deriveWeeksFromWorkouts`)
 * - Meta: `wn`, `phase`, Label „Woche N · Phase“ (wie `api/_lib/deterministicPlanGenerator.js`), `dates` „8. Mär ff.“
 *   (erster Plantag der Woche), `focus` je Phase; Entlastung: `isRecoveryWeek` und „Entlastung…“ im `focus` (I22)
 * - `meta.core`: Config-Version, Eingaben (verfügbare Tage in der Reihenfolge Mo–So), Regeln; `meta.volumeNote` bei
 *   `peak-not-reached`
 *
 * `rules` werden im MVP nur gespeichert (docs/plan-core-plan.md, Entscheidung 9: `EMPTY_RULES`).
 */

import { CONFIG, CONFIG_VERSION } from "./config";
import { mondayOf, WEEKDAYS } from "./dates";
import { checkAssembledPlan, checkPlan } from "./invariants";
import type { CheckResult } from "./invariants";
import { planSessions } from "./planSessions";
import type { SessionPlan } from "./planSessions";
import { renderSession } from "./text";
import type { CoreInputs, CorePhase, CorePlan, CorePlanMeta, CoreWeek, CoreWeekMeta, CoreWorkout, PlanRules, Ymd } from "./types";

const DE_MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Ein Phasenname pro Phase, wie in der App (`src/planV2/trainingPhase.ts`). */
const PHASE_LABEL_DE: Record<CorePhase, string> = { base: "Grundlage", build: "Aufbau", peak: "Spitze", taper: "Taper" };

/** Fokus je Phase (Wortlaut wie im bisherigen Generator); Rennwoche eigener Text. */
const PHASE_FOCUS_DE: Record<CorePhase, string> = {
  base: "Aerobe Basis aufbauen",
  build: "Volumen und Intensität steigern",
  peak: "Rennspezifische Reize setzen",
  taper: "Erholen und schärfen",
};
const RACE_WEEK_FOCUS_DE = "Rennwoche – frisch an den Start";

/** Fokus der Entlastungswoche; enthält `volume.recovery.focusKeyword`, an dem die App die Woche heute erkennt. */
export const RECOVERY_WEEK_FOCUS_DE = `${CONFIG.volume.recovery.focusKeyword.value}swoche – Volumen reduziert, Adaptationen festigen`;

/** „8. Mär ff.“ */
function datesLabel(ymd: Ymd): string {
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  return `${day}. ${DE_MONTHS[month - 1]} ff.`;
}

const dateIsoOf = (ymd: Ymd): string => `${ymd}T12:00:00.000Z`;

/**
 * Eingaben so, wie `normalizePlanCoreMeta` sie speichert (verfügbare Tage Mo–So, keine leeren optionalen Felder).
 * `freeText` wird nie gespeichert: er bleibt nur in den Preferences (Entscheidung 2026-11-06).
 */
function storedInputs(inputs: CoreInputs): CoreInputs {
  const out: CoreInputs = {
    distance: inputs.distance,
    raceDate: inputs.raceDate,
    startYmd: inputs.startYmd,
    runDaysPerWeek: inputs.runDaysPerWeek,
    availableDays: WEEKDAYS.filter((day) => inputs.availableDays.indexOf(day) >= 0),
    currentWeeklyKm: inputs.currentWeeklyKm,
  };
  if (inputs.longRunDay !== undefined) out.longRunDay = inputs.longRunDay;
  if (inputs.longestRecentRunKm !== undefined) out.longestRecentRunKm = inputs.longestRecentRunKm;
  if (inputs.recentRace !== undefined) out.recentRace = inputs.recentRace;
  if (inputs.goalTime !== undefined) out.goalTime = inputs.goalTime;
  return out;
}

/** `SessionPlan` → `CorePlan`. */
export function assemblePlan(plan: SessionPlan, inputs: CoreInputs, rules: PlanRules): CorePlan {
  const weeks: CoreWeek[] = plan.weeks.map((week) => {
    const workouts: CoreWorkout[] = week.sessions.map((session) => {
      const text = renderSession(session, { distance: inputs.distance, recoveryWeek: week.isRecoveryWeek });
      return {
        id: `pc-${session.ymd}-${session.kind}`,
        dateIso: dateIsoOf(session.ymd),
        sport: session.kind === "REST" ? "rest" : "run",
        sessionType: text.sessionType,
        kind: session.kind,
        intensity: text.intensity,
        title: text.title,
        km: session.kind === "REST" ? 0 : session.km,
        desc: text.desc,
        pace: text.pace,
        structured: text.structured,
      };
    });
    // Wie `deriveWeeksFromWorkouts`: Lauf-km in Tagesreihenfolge aufsummiert, auf 0,1 km gerundet (sonst 83.20000000000002).
    let totalKm = 0;
    workouts.forEach((w) => {
      if (w.sport !== "rest" && w.km) totalKm += w.km;
    });
    totalKm = Math.round(totalKm * 10) / 10;
    const isRace = week.mode === "race";
    const meta: CoreWeekMeta = {
      wn: week.wn,
      phase: week.phase,
      label: `Woche ${week.wn} · ${PHASE_LABEL_DE[week.phase]}`,
      dates: datesLabel(week.sessions[0].ymd),
      focus: week.isRecoveryWeek ? RECOVERY_WEEK_FOCUS_DE : isRace ? RACE_WEEK_FOCUS_DE : PHASE_FOCUS_DE[week.phase],
    };
    if (week.isRecoveryWeek) meta.isRecoveryWeek = true;
    return { startIso: mondayOf(week.sessions[0].ymd), totalKm, workouts, meta };
  });

  const meta: CorePlanMeta = { core: { configVersion: CONFIG_VERSION, inputs: storedInputs(inputs), rules } };
  const note = plan.volume.notes.filter((n) => n.code === "peak-not-reached")[0];
  if (note !== undefined && note.code === "peak-not-reached") {
    meta.volumeNote = { code: "peak-not-reached", reason: note.reason, targetPeakKm: note.targetPeakKm, reachedPeakKm: note.reachedPeakKm };
  }
  return {
    version: 2,
    workouts: weeks.reduce((list, week) => list.concat(week.workouts), [] as CoreWorkout[]),
    weeks,
    meta,
  };
}

/** Plan aus den Eingaben (`todayYmd`: Bezugstag für das Rennalter). Wirft nur bei ungültigen Eingaben (`planCoreError`). */
export function buildPlan(inputs: CoreInputs, rules: PlanRules, todayYmd: Ymd): CorePlan {
  return assemblePlan(planSessions(inputs, todayYmd), inputs, rules);
}

/**
 * Plan und Prüfung in einem Schritt, für Server (Schritt 10) und App (Schritt 11): `check` fasst `checkPlan` (Einheiten,
 * Volumen, Paces) und `checkAssembledPlan` (fertiger Plan) zusammen. Bei `check.errors > 0` wird der Plan nicht
 * ausgeliefert.
 */
export function buildCheckedPlan(inputs: CoreInputs, rules: PlanRules, todayYmd: Ymd): { plan: CorePlan; check: CheckResult } {
  const sessions = planSessions(inputs, todayYmd);
  const plan = assemblePlan(sessions, inputs, rules);
  const core = checkPlan(sessions, inputs);
  const assembled = checkAssembledPlan(plan, inputs);
  const violations = core.violations.concat(assembled.violations);
  return {
    plan,
    check: {
      violations,
      errors: core.errors + assembled.errors,
      warnings: core.warnings + assembled.warnings,
    },
  };
}
