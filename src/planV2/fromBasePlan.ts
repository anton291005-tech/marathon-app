import type { PlanSession, PlanWeek } from "../marathonPrediction";
import { parseSessionDateLabel } from "../appSmartFeatures";
import { rebuildPlanFromWorkouts } from "../core/deriveWeeksFromWorkouts";
import { resolveLegacyYears } from "./legacyYearAnchor";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";
import type { TrainingPlanV2, WeekV2, WorkoutV2 } from "./types";
import { normalizeTrainingPhase } from "./trainingPhase";

/** Schaltjahr als Probejahr, damit "29. Feb" beim Label-Parsen nicht wegrutscht. */
const LABEL_PROBE_YEAR = 2000;

function sessionTypeToSport(type: string): WorkoutV2["sport"] {
  if (type === "bike") return "bike";
  if (type === "rest") return "rest";
  return "run";
}

/**
 * Kalenderjahr je Session. Die Labels eines Basisplans ("6. Apr") tragen kein
 * Jahr, deshalb muss der Aufrufer `startYear` explizit übergeben; der
 * Jahreswechsel innerhalb des Plans wird daraus abgeleitet (siehe
 * `legacyYearAnchor.ts`), statt ihn wie früher auf 2026 zu raten.
 */
function yearBySession(base: PlanWeek[], startYear: number): Map<PlanSession, number> {
  const dated = base
    .flatMap((week) => (Array.isArray(week.s) ? week.s : []))
    .map((session) => ({ session, probe: parseSessionDateLabel(session.date, LABEL_PROBE_YEAR) }))
    .filter((entry): entry is { session: PlanSession; probe: Date } => !!entry.probe);

  const years = resolveLegacyYears(
    dated.map((entry) => entry.probe.getMonth()),
    { year: startYear, index: 0, source: "planStartDate" },
  );

  const map = new Map<PlanSession, number>();
  dated.forEach((entry, index) => map.set(entry.session, years[index]));
  return map;
}

function weekStartIsoFromWeek(week: PlanWeek, yearOf: Map<PlanSession, number>): string | null {
  if (!week.s || !Array.isArray(week.s)) return null;
  // Use first parseable session date in this week to compute Monday start.
  const dates = week.s
    .map((s) => sessionDate(s, yearOf))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return null;
  const d = new Date(dates[0]);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const offset = (day + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function sessionDate(session: PlanSession, yearOf: Map<PlanSession, number>): Date | null {
  const year = yearOf.get(session);
  if (year == null) return null;
  return parseSessionDateLabel(session.date, year);
}

export function buildWeekMetaMapFromBasePlan(
  base: PlanWeek[],
  startYear: number,
): Map<string, WeekV2["meta"]> {
  const yearOf = yearBySession(base, startYear);
  const map = new Map<string, WeekV2["meta"]>();
  for (const week of base) {
    const startIso = weekStartIsoFromWeek(week, yearOf);
    if (!startIso) continue;
    map.set(startIso, {
      wn: week.wn,
      phase: normalizeTrainingPhase(week.phase),
      label: week.label ?? "",
      dates: week.dates ?? "",
      focus: week.focus,
    });
  }
  return map;
}

function toWorkout(session: PlanSession, yearOf: Map<PlanSession, number>): WorkoutV2 | null {
  const d = sessionDate(session, yearOf);
  if (!d) return null;
  const iso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
  return {
    id: session.id,
    dateIso: iso,
    sport: sessionTypeToSport(session.type),
    sessionType: session.type,
    title: session.title,
    km: typeof session.km === "number" && Number.isFinite(session.km) ? session.km : 0,
    desc: session.desc ?? null,
    pace: session.pace ?? null,
    structured: session.structured ?? null,
  };
}

export function buildTrainingPlanV2FromBasePlan(
  base: PlanWeek[],
  startYear: number,
): TrainingPlanV2 {
  const yearOf = yearBySession(base, startYear);
  const metaByWeekStart = buildWeekMetaMapFromBasePlan(base, startYear);
  const workouts: WorkoutV2[] = base
    .flatMap((w) => (Array.isArray(w.s) ? w.s : []))
    .map((session) => toWorkout(session, yearOf))
    .filter((w): w is WorkoutV2 => !!w);
  return normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts, metaByWeekStart }));
}
