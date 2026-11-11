import type { TrainingPlanV2, WeekV2, WorkoutSport, WorkoutV2 } from "../planV2/types";
import { mondayYmdOfDateIso } from "./calendarYmd";

function sportFromSessionType(type: string): WorkoutSport {
  if (type === "bike") return "bike";
  if (type === "swim") return "swim";
  if (type === "strength") return "strength";
  if (type === "rest") return "rest";
  return "run";
}

export function normalizeWorkoutsV2(workouts: WorkoutV2[]): WorkoutV2[] {
  return workouts.map((w) => ({
    ...w,
    sport: w.sport ?? sportFromSessionType(w.sessionType),
    km: typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0,
  }));
}

export function deriveWeeksFromWorkouts(
  workouts: WorkoutV2[],
  metaByWeekStart?: Map<string, WeekV2["meta"]>,
  /** Maps a Monday ISO date to an override week-start ISO (for mid-week plan starts). */
  weekKeyOverrides?: Map<string, string>,
): WeekV2[] {
  const weeksMap = new Map<string, WeekV2>();
  const normalized = normalizeWorkoutsV2(workouts);

  for (const w of normalized) {
    // Kalendarisch in UTC, nicht über lokale Zeit: siehe `calendarYmd.ts` (ab UTC+13 sonst ein Tag zu früh).
    const mondayIso = mondayYmdOfDateIso(w.dateIso);
    if (!mondayIso) continue;
    const weekStart = weekKeyOverrides?.get(mondayIso) ?? mondayIso;

    if (!weeksMap.has(weekStart)) {
      weeksMap.set(weekStart, {
        startIso: weekStart,
        workouts: [],
        totalKm: 0,
        meta: metaByWeekStart?.get(weekStart),
      });
    }

    const week = weeksMap.get(weekStart)!;
    week.workouts.push(w);
    if (w.sport !== "rest" && w.km) week.totalKm += w.km;
  }

  const weeks = Array.from(weeksMap.values()).sort((a, b) => a.startIso.localeCompare(b.startIso));
  for (const week of weeks) {
    week.workouts.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    // Gleitkomma-Rauschen der Summe weg (z. B. 83.20000000000002 → 83.2); gleiche Regel wie `buildPlan` im Plan-Kern.
    week.totalKm = Math.round(week.totalKm * 10) / 10;
  }
  return weeks;
}

export function rebuildPlanFromWorkouts(args: {
  workouts: WorkoutV2[];
  metaByWeekStart?: Map<string, WeekV2["meta"]>;
  /** Maps Monday ISO → override week-start ISO (for mid-week plan starts). */
  weekKeyOverrides?: Map<string, string>;
}): TrainingPlanV2 {
  const weeks = deriveWeeksFromWorkouts(args.workouts, args.metaByWeekStart, args.weekKeyOverrides);
  return { version: 2, workouts: normalizeWorkoutsV2(args.workouts), weeks };
}

