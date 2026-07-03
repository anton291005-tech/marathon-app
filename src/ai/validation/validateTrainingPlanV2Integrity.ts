import type { TrainingPlanV2 } from "../../planV2/types";

function isValidIsoDate(value: string): boolean {
  const d = new Date(value);
  return typeof value === "string" && value.length > 0 && Number.isFinite(d.getTime());
}

export function validateTrainingPlanV2Integrity(plan: TrainingPlanV2): boolean {
  if (!plan) {
    // eslint-disable-next-line no-console
    console.error("[PlanValidation] plan is null or undefined");
    return false;
  }

  if (plan.version !== 2) {
    // eslint-disable-next-line no-console
    console.error("[PlanValidation] version mismatch:", plan.version);
    return false;
  }

  if (!Array.isArray(plan.workouts)) {
    // eslint-disable-next-line no-console
    console.error("[PlanValidation] plan.workouts is not an array:", plan.workouts);
    return false;
  }

  if (!Array.isArray(plan.weeks)) {
    // eslint-disable-next-line no-console
    console.error("[PlanValidation] plan.weeks is not an array:", plan.weeks);
    return false;
  }

  const ids = new Set<string>();
  const triple = new Set<string>();

  for (const w of plan.workouts) {
    if (!w || typeof w.id !== "string" || !w.id.trim()) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] duplicate/empty id:", w?.id ?? w);
      return false;
    }
    if (ids.has(w.id)) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] duplicate/empty id:", w.id);
      return false;
    }
    ids.add(w.id);

    if (!isValidIsoDate(w.dateIso)) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] invalid dateIso:", w.id, w.dateIso);
      return false;
    }

    if (typeof w.sessionType !== "string" || !w.sessionType.trim()) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] empty sessionType:", w.id);
      return false;
    }

    if (typeof w.title !== "string") {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] title is not a string:", w.id, w.title);
      return false;
    }

    const key = `${w.id}|${w.dateIso.slice(0, 10)}|${w.sessionType}`;
    if (triple.has(key)) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] duplicate id|date|sessionType triple:", key);
      return false;
    }
    triple.add(key);
  }

  const inWeeks = new Set<string>();
  for (const week of plan.weeks) {
    if (!week) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] week entry is null or undefined");
      return false;
    }

    if (typeof week.startIso !== "string" || week.startIso.length !== 10) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] startIso wrong length:", week.startIso, week.startIso?.length);
      return false;
    }

    if (!Array.isArray(week.workouts)) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] week.workouts is not an array:", week.startIso);
      return false;
    }

    let sumKm = 0;
    for (const w of week.workouts) {
      if (!w?.id) {
        // eslint-disable-next-line no-console
        console.error("[PlanValidation] week workout missing id:", week.startIso, w);
        return false;
      }
      inWeeks.add(w.id);
      const km = typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0;
      if (w.sport !== "rest") sumKm += km;
    }

    const totalKm = typeof week.totalKm === "number" && Number.isFinite(week.totalKm) ? week.totalKm : 0;
    if (Math.abs(totalKm - sumKm) > 0.0001) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] totalKm mismatch:", {
        week: week.startIso,
        expected: week.totalKm,
        actual: sumKm,
        diff: Math.abs(totalKm - sumKm),
      });
      return false;
    }
  }

  if (inWeeks.size !== plan.workouts.length) {
    // eslint-disable-next-line no-console
    console.error("[PlanValidation] weeks workout id count mismatch:", {
      inWeeksCount: inWeeks.size,
      workoutsCount: plan.workouts.length,
    });
    return false;
  }

  const weekIdCounts = new Map<string, number>();
  for (const week of plan.weeks) {
    for (const w of week.workouts) {
      if (w?.id) {
        weekIdCounts.set(w.id, (weekIdCounts.get(w.id) ?? 0) + 1);
      }
    }
  }

  for (const w of plan.workouts) {
    const count = weekIdCounts.get(w.id) ?? 0;
    if (count !== 1) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] workout not exactly once in weeks:", w.id, "count:", count);
      return false;
    }
    if (!inWeeks.has(w.id)) {
      // eslint-disable-next-line no-console
      console.error("[PlanValidation] workout not exactly once in weeks:", w.id, "count:", count);
      return false;
    }
  }

  return true;
}
