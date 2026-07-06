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

// Hard limits for how much of a week's running volume a single long run may cover.
// HIGH_VOLUME applies only in peak-phase weeks at/above the km threshold — see
// applyLongRunCapPerWeek(). Does not apply to ultra distances (see call sites), where
// raceVolumeReference.js's peakLongRunKm values assume a much higher long-run share by design.
const LONG_RUN_CAP_STANDARD = 0.3;
const LONG_RUN_CAP_HIGH_VOLUME = 0.33;
const HIGH_VOLUME_WEEKLY_KM_THRESHOLD = 120;

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

/**
 * Hard clamp: if the long run of a week exceeds `maxPercent` of `weekTotalKm`, cuts it
 * down to the cap and redistributes the excess proportionally onto the week's other run
 * workouts (not rest/bike/strength/race), so the week total stays exactly unchanged.
 *
 * If there are no other run workouts to absorb the excess (e.g. a taper week with only
 * the long run and rest days), the long run is still clamped and the week total drops —
 * there is nothing else it could be redistributed onto.
 *
 * @param {Array<{sessionType?: string, sport?: string, km: number}>} workouts - one week's workouts
 * @param {number} weekTotalKm - this week's total km (sumWeekKm(workouts))
 * @param {number} maxPercent - e.g. LONG_RUN_CAP_STANDARD or LONG_RUN_CAP_HIGH_VOLUME
 * @returns {Array} new workouts array (originals untouched) with the clamp applied
 */
function clampLongRunToWeekPercent(workouts, weekTotalKm, maxPercent) {
  if (!(weekTotalKm > 0) || !Array.isArray(workouts) || workouts.length === 0) {
    return workouts;
  }

  const longRun = workouts.find((w) => w.sessionType === "long" && w.km > 0);
  if (!longRun) return workouts;

  const capKm = Math.round(weekTotalKm * maxPercent * 10) / 10;
  if (longRun.km <= capKm) return workouts;

  const excessKm = Math.round((longRun.km - capKm) * 10) / 10;
  const otherRuns = workouts.filter(
    (w) => w !== longRun && w.sport === "run" && w.sessionType !== "race" && w.km > 0,
  );
  const otherRunsTotalKm = otherRuns.reduce((sum, w) => sum + w.km, 0);

  if (otherRuns.length === 0 || otherRunsTotalKm <= 0) {
    return workouts.map((w) => (w === longRun ? { ...w, km: capKm } : w));
  }

  // Largest-remainder method: proportional shares rounded independently to 0.1 km would
  // drift from excessKm, breaking the "week total stays exact" guarantee. Working in
  // integer 0.1-km units keeps the redistributed total exactly equal to excessKm.
  const shareUnits = otherRuns.map((w) => (excessKm * 10 * w.km) / otherRunsTotalKm);
  const flooredUnits = shareUnits.map((v) => Math.floor(v));
  let remainderUnits = Math.round(excessKm * 10) - flooredUnits.reduce((sum, v) => sum + v, 0);

  const byFractionDesc = shareUnits
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const deltaUnits = [...flooredUnits];
  for (let k = 0; k < byFractionDesc.length && remainderUnits > 0; k += 1) {
    deltaUnits[byFractionDesc[k].i] += 1;
    remainderUnits -= 1;
  }

  const deltaByRun = new Map(otherRuns.map((w, i) => [w, deltaUnits[i] / 10]));

  return workouts.map((w) => {
    if (w === longRun) return { ...w, km: capKm };
    if (deltaByRun.has(w)) {
      return { ...w, km: Math.round((w.km + deltaByRun.get(w)) * 10) / 10 };
    }
    return w;
  });
}

/**
 * Groups `workouts` by week and applies clampLongRunToWeekPercent() to each week, choosing
 * LONG_RUN_CAP_HIGH_VOLUME only for peak-phase weeks at/above HIGH_VOLUME_WEEKLY_KM_THRESHOLD.
 *
 * @param {Array} workouts - all workouts (any number of weeks)
 * @param {(weekStartIso: string) => (string|undefined)} getPhaseForWeekStart - resolves a
 *   week's phase ("base"|"build"|"peak"|"taper") from its Monday-based start date
 * @returns {Array} flattened, clamped workouts (same length/order-by-week as input)
 */
function applyLongRunCapPerWeek(workouts, getPhaseForWeekStart) {
  const weekGroups = groupWorkoutsByWeekStart(workouts);
  const result = [];
  for (const [weekStartIso, weekWorkouts] of weekGroups) {
    const weekTotalKm = sumWeekKm(weekWorkouts);
    const phase = getPhaseForWeekStart ? getPhaseForWeekStart(weekStartIso) : undefined;
    const maxPercent =
      weekTotalKm >= HIGH_VOLUME_WEEKLY_KM_THRESHOLD && phase === "peak"
        ? LONG_RUN_CAP_HIGH_VOLUME
        : LONG_RUN_CAP_STANDARD;
    result.push(...clampLongRunToWeekPercent(weekWorkouts, weekTotalKm, maxPercent));
  }
  return result;
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
  clampLongRunToWeekPercent,
  applyLongRunCapPerWeek,
  LONG_RUN_CAP_STANDARD,
  LONG_RUN_CAP_HIGH_VOLUME,
  HIGH_VOLUME_WEEKLY_KM_THRESHOLD,
};
