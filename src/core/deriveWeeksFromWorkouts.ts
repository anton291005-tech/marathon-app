import type { TrainingPlanV2, WeekV2, WorkoutSport, WorkoutV2 } from "../planV2/types";

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

function safeDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function sportFromSessionType(type: string): WorkoutSport {
  if (type === "bike") return "bike";
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
): WeekV2[] {
  const weeksMap = new Map<string, WeekV2>();
  const normalized = normalizeWorkoutsV2(workouts);

  for (const w of normalized) {
    const d = safeDate(w.dateIso);
    if (!d) continue;
    const weekStart = ymd(startOfIsoWeekMonday(d));

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
  }
  return weeks;
}

export function rebuildPlanFromWorkouts(args: {
  workouts: WorkoutV2[];
  metaByWeekStart?: Map<string, WeekV2["meta"]>;
}): TrainingPlanV2 {
  const weeks = deriveWeeksFromWorkouts(args.workouts, args.metaByWeekStart);
  return { version: 2, workouts: normalizeWorkoutsV2(args.workouts), weeks };
}

