"use strict";

const GERMAN_MONTHS = {
  jan: 0,
  feb: 1,
  mär: 2,
  mar: 2,
  apr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  dez: 11,
  dec: 11,
};

const DAY_OFFSET = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 };

function startOfIsoWeekMonday(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const offset = (day + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function normalizePhaseValue(raw) {
  const upper = String(raw ?? "").toUpperCase();
  if (upper === "BASE") return "base";
  if (upper === "BUILD") return "build";
  if (upper === "PEAK") return "peak";
  if (upper === "TAPER") return "taper";
  return undefined;
}

function sportFromSessionType(type) {
  if (type === "bike") return "bike";
  if (type === "swim") return "swim";
  if (type === "strength") return "strength";
  if (type === "rest") return "rest";
  return "run";
}

function addDaysIso(startIso, days) {
  const d = new Date(`${startIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function parseGermanDateLabel(label, fallbackYear) {
  const match = String(label)
    .trim()
    .match(/^(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)/);
  if (!match) return null;
  const day = Number(match[1]);
  const monthKey = match[2].toLowerCase().replace(/\./g, "");
  const month = GERMAN_MONTHS[monthKey.slice(0, 3)];
  if (!Number.isFinite(day) || month == null) return null;
  const year = Number(fallbackYear) || new Date().getFullYear();
  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function resolveWorkoutDateIso(w, weeksById, profile) {
  if (w.dateIso && Number.isFinite(new Date(w.dateIso).getTime())) {
    return w.dateIso.includes("T") ? w.dateIso : `${w.dateIso.slice(0, 10)}T12:00:00.000Z`;
  }

  if (w.weekId && w.day && weeksById.has(w.weekId)) {
    const offset = DAY_OFFSET[w.day];
    if (offset != null) {
      return addDaysIso(weeksById.get(w.weekId), offset);
    }
  }

  const fallbackYear =
    profile?.planStartDate?.slice(-4) ??
    profile?.raceDate?.slice(-4) ??
    new Date().getFullYear();
  if (w.date) {
    const parsed = parseGermanDateLabel(w.date, fallbackYear);
    if (parsed) return parsed;
  }

  return "";
}

function normalizeWorkouts(parsed, profile) {
  const weeksById = new Map();
  if (Array.isArray(parsed?.weeks)) {
    for (const week of parsed.weeks) {
      if (week?.id && week?.startIso) weeksById.set(week.id, week.startIso);
    }
  }

  const raw = Array.isArray(parsed?.workouts) ? parsed.workouts : [];
  return raw.map((w) => ({
    id: String(w.id ?? ""),
    dateIso: resolveWorkoutDateIso(w, weeksById, profile),
    sport: w.sport ?? sportFromSessionType(w.sessionType ?? w.type ?? "easy"),
    sessionType: String(w.sessionType ?? w.type ?? "easy"),
    title: String(w.title ?? ""),
    km: typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0,
    desc: w.desc ?? w.description ?? null,
    pace: w.pace ?? null,
    structured: w.structured ?? null,
    intensity: w.intensity ?? undefined,
    phase: typeof w.phase === "string" && w.phase ? w.phase : undefined,
  }));
}

function deriveWeeksFromWorkouts(workouts, metaByWeekStart, weekKeyOverrides) {
  const weeksMap = new Map();
  const normalized = workouts.map((w) => ({
    ...w,
    sport: w.sport ?? sportFromSessionType(w.sessionType),
    km: typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0,
  }));

  for (const w of normalized) {
    const d = new Date(w.dateIso);
    if (!Number.isFinite(d.getTime())) continue;
    const mondayIso = startOfIsoWeekMonday(d).toISOString().slice(0, 10);
    const weekStart = weekKeyOverrides?.get(mondayIso) ?? mondayIso;

    if (!weeksMap.has(weekStart)) {
      weeksMap.set(weekStart, {
        startIso: weekStart,
        workouts: [],
        totalKm: 0,
        meta: metaByWeekStart?.get(weekStart),
      });
    }

    const week = weeksMap.get(weekStart);
    week.workouts.push(w);
    if (w.sport !== "rest" && w.km) week.totalKm += w.km;

    // Fallback/cross-check: if metaByWeekStart has no entry for this week (e.g. gap in
    // schedule mapping), derive a minimal meta from the phase Claude attached to the workout.
    if (!week.meta) {
      const fallbackPhase = normalizePhaseValue(w.phase);
      if (fallbackPhase) week.meta = { phase: fallbackPhase };
    }
  }

  const weeks = Array.from(weeksMap.values()).sort((a, b) =>
    a.startIso.localeCompare(b.startIso),
  );
  for (const week of weeks) {
    week.workouts.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }
  return weeks;
}

function rebuildPlanFromWorkouts(workouts, metaByWeekStart, weekKeyOverrides) {
  const normalized = workouts.map((w) => ({
    ...w,
    sport: w.sport ?? sportFromSessionType(w.sessionType),
    km: typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0,
  }));
  const weeks = deriveWeeksFromWorkouts(normalized, metaByWeekStart, weekKeyOverrides);
  return { version: 2, workouts: normalized, weeks };
}

function parseClaudeJson(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function sumWeekKm(workouts) {
  return workouts.reduce((sum, w) => {
    if (w.sport !== "rest" && w.km > 0) return sum + w.km;
    return sum;
  }, 0);
}

function groupWorkoutsByWeekStart(workouts) {
  const byWeek = new Map();
  for (const w of workouts) {
    const d = new Date(w.dateIso);
    if (!Number.isFinite(d.getTime())) continue;
    const weekStart = startOfIsoWeekMonday(d).toISOString().slice(0, 10);
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, []);
    byWeek.get(weekStart).push(w);
  }
  return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function getPreviousPhaseSummary(workouts) {
  if (!workouts?.length) return null;
  const sorted = groupWorkoutsByWeekStart(workouts);
  const last = sorted[sorted.length - 1];
  if (!last) return null;

  const lastWeekWorkouts = last[1];
  const lastWorkout = [...lastWeekWorkouts].sort((a, b) => a.dateIso.localeCompare(b.dateIso)).pop();

  return {
    lastWeekStartIso: last[0],
    lastWeekEndIso: lastWorkout?.dateIso?.slice(0, 10) ?? last[0],
    lastWeekTotalKm: Math.round(sumWeekKm(lastWeekWorkouts) * 10) / 10,
    lastWorkoutDateIso: lastWorkout?.dateIso ?? null,
  };
}

/**
 * Scales fallback phase workouts so the phase connects to the actual previous phase volume,
 * not the standalone deterministic plan's default progression.
 */
function scalePhaseWorkoutsForContinuity(phaseWorkouts, previousPhaseSummary, deterministicReferenceKm) {
  if (!previousPhaseSummary?.lastWeekTotalKm || !phaseWorkouts?.length) {
    return phaseWorkouts;
  }

  let refKm = deterministicReferenceKm;
  if (refKm == null || refKm <= 0) {
    const weeks = groupWorkoutsByWeekStart(phaseWorkouts);
    refKm = weeks.length > 0 ? sumWeekKm(weeks[0][1]) : 0;
  }
  if (refKm <= 0) return phaseWorkouts;

  const targetKm = previousPhaseSummary.lastWeekTotalKm;
  let scale = targetKm / refKm;
  scale = Math.max(0.55, Math.min(1.45, scale));

  if (Math.abs(scale - 1) < 0.02) return phaseWorkouts;

  return phaseWorkouts.map((w) => {
    if (w.sport === "rest" || w.km <= 0) return w;
    return { ...w, km: Math.round(w.km * scale * 10) / 10 };
  });
}

module.exports = {
  normalizeWorkouts,
  rebuildPlanFromWorkouts,
  parseClaudeJson,
  sumWeekKm,
  getPreviousPhaseSummary,
  scalePhaseWorkoutsForContinuity,
  groupWorkoutsByWeekStart,
  startOfIsoWeekMonday,
};
