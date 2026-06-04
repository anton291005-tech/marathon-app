import type { TrainingPlanV2 } from "../../planV2/types";

function isValidIsoDate(value: string): boolean {
  const d = new Date(value);
  return typeof value === "string" && value.length > 0 && Number.isFinite(d.getTime());
}

export function validateTrainingPlanV2Integrity(plan: TrainingPlanV2): boolean {
  if (!plan || plan.version !== 2) return false;
  if (!Array.isArray(plan.workouts) || !Array.isArray(plan.weeks)) return false;

  const ids = new Set<string>();
  const triple = new Set<string>();

  for (const w of plan.workouts) {
    if (!w || typeof w.id !== "string" || !w.id.trim()) return false;
    if (ids.has(w.id)) return false;
    ids.add(w.id);
    if (!isValidIsoDate(w.dateIso)) return false;
    if (typeof w.sessionType !== "string" || !w.sessionType.trim()) return false;
    if (typeof w.title !== "string") return false;

    const key = `${w.id}|${w.dateIso.slice(0, 10)}|${w.sessionType}`;
    if (triple.has(key)) return false;
    triple.add(key);
  }

  // weeks are derived: validate references + totals
  const inWeeks = new Set<string>();
  for (const week of plan.weeks) {
    if (!week || typeof week.startIso !== "string" || week.startIso.length !== 10) return false;
    if (!Array.isArray(week.workouts)) return false;
    let sumKm = 0;
    for (const w of week.workouts) {
      if (!w?.id) return false;
      inWeeks.add(w.id);
      const km = typeof w.km === "number" && Number.isFinite(w.km) ? w.km : 0;
      if (w.sport !== "rest") sumKm += km;
    }
    const totalKm = typeof week.totalKm === "number" && Number.isFinite(week.totalKm) ? week.totalKm : 0;
    if (Math.abs(totalKm - sumKm) > 0.0001) return false;
  }

  // no missing / no duplicates between workouts and derived weeks
  if (inWeeks.size !== plan.workouts.length) return false;
  for (const w of plan.workouts) {
    if (!inWeeks.has(w.id)) return false;
  }

  return true;
}

