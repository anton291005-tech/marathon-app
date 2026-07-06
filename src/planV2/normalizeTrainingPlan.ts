import { parseSessionDateLabel } from "../appSmartFeatures";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { rebuildPlanFromWorkouts } from "../core/deriveWeeksFromWorkouts";
import { mapSessionType } from "../lib/ai/mapSessionType";
import type { Intensity, TrainingPlanV2, WeekV2, WorkoutSport, WorkoutV2 } from "./types";
import { normalizeTrainingPhase, trainingPhaseLabelDe } from "./trainingPhase";

const VALID_SPORTS = new Set<WorkoutSport>(["run", "bike", "rest", "strength", "swim"]);
const VALID_INTENSITIES = new Set<Intensity>(["low", "medium", "high"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function sportFromSessionType(sessionType: string): WorkoutSport {
  const key = sessionType.trim().toLowerCase();
  if (key === "bike") return "bike";
  if (key === "swim") return "swim";
  if (key === "strength") return "strength";
  if (key === "rest") return "rest";
  return "run";
}

function normalizeSport(raw: unknown, sessionType: string): WorkoutSport {
  if (typeof raw === "string" && VALID_SPORTS.has(raw as WorkoutSport)) {
    return raw as WorkoutSport;
  }
  return sportFromSessionType(sessionType);
}

function normalizeIntensity(raw: unknown, sessionType: string): Intensity | undefined {
  if (typeof raw === "string" && VALID_INTENSITIES.has(raw as Intensity)) {
    return raw as Intensity;
  }
  const key = sessionType.trim().toLowerCase();
  if (key === "interval" || key === "race") return "high";
  if (key === "tempo") return "medium";
  if (key === "rest") return undefined;
  return "low";
}

function normalizeKm(raw: unknown): number {
  const parsed =
    typeof raw === "number"
      ? raw
      : Number.parseFloat(String(raw ?? "").replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeOptionalString(raw: unknown): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  return text ? text : null;
}

function mondayIsoFromDateIso(dateIso: string): string | null {
  const date = new Date(dateIso);
  if (!Number.isFinite(date.getTime())) return null;
  date.setHours(12, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

const GERMAN_MONTH_ALIASES: Record<string, string> = {
  Mär: "Mar",
  mär: "Mar",
  Okt: "Okt",
  Dez: "Dez",
};

function normalizeGermanDateLabel(label: string): string {
  return label.replace(/M[äa]r\b/gi, "Mar");
}

function parseLegacySessionDate(rawDate: unknown): Date | null {
  if (typeof rawDate !== "string" || !rawDate.trim()) return null;
  const direct = parseSessionDateLabel(rawDate);
  if (direct) return direct;
  const normalizedLabel = normalizeGermanDateLabel(rawDate);
  if (normalizedLabel !== rawDate) {
    return parseSessionDateLabel(normalizedLabel);
  }
  for (const alias of Object.keys(GERMAN_MONTH_ALIASES)) {
    if (rawDate.includes(alias)) {
      return parseSessionDateLabel(rawDate.replace(alias, GERMAN_MONTH_ALIASES[alias]));
    }
  }
  return null;
}

function dateIsoFromUnknown(rawDate: unknown, rawDay?: unknown): string | null {
  if (typeof rawDate === "string" && rawDate.includes("T")) {
    const parsed = new Date(rawDate);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    const parsed = new Date(`${rawDate.slice(0, 10)}T12:00:00`);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  const legacyDate = parseLegacySessionDate(rawDate);
  if (legacyDate) {
    return new Date(
      legacyDate.getFullYear(),
      legacyDate.getMonth(),
      legacyDate.getDate(),
      12,
      0,
      0,
      0,
    ).toISOString();
  }
  if (typeof rawDay === "string" && typeof rawDate === "string") {
    const parsed = parseLegacySessionDate(rawDate);
    if (parsed) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0).toISOString();
    }
  }
  return null;
}

function defaultTitleForSessionType(sessionType: string): string {
  const key = sessionType.trim().toLowerCase();
  if (key === "rest") return "Ruhetag";
  if (key === "long") return "Long Run";
  if (key === "interval") return "Intervalle";
  if (key === "tempo") return "Tempo";
  if (key === "race") return "Wettkampf";
  if (key === "bike") return "Rad";
  if (key === "strength") return "Kraft";
  return "Training";
}

function normalizeWorkout(raw: unknown, fallbackIndex: number): WorkoutV2 | null {
  if (!isRecord(raw)) return null;

  const sessionTypeRaw =
    typeof raw.sessionType === "string" && raw.sessionType.trim()
      ? raw.sessionType.trim()
      : typeof raw.type === "string" && raw.type.trim()
        ? raw.type.trim()
        : "easy";
  const sessionType = mapSessionType(sessionTypeRaw);

  const dateIso =
    dateIsoFromUnknown(raw.dateIso, raw.day) ??
    dateIsoFromUnknown(raw.date, raw.day);
  if (!dateIso) return null;

  const idRaw = typeof raw.id === "string" ? raw.id.trim() : "";
  const id = idRaw || `normalized-workout-${fallbackIndex}-${dateIso.slice(0, 10)}`;

  const titleRaw = typeof raw.title === "string" ? raw.title.trim() : "";
  const title = titleRaw || defaultTitleForSessionType(sessionType);

  return {
    id,
    dateIso,
    sport: normalizeSport(raw.sport, sessionType),
    sessionType,
    intensity: normalizeIntensity(raw.intensity, sessionType),
    title,
    km: normalizeKm(raw.km),
    desc: normalizeOptionalString(raw.desc),
    pace: normalizeOptionalString(raw.pace),
    structured: raw.structured ?? null,
  };
}

export function normalizeWeekMeta(
  raw: unknown,
  weekIndex: number,
): NonNullable<WeekV2["meta"]> {
  const base = isRecord(raw) ? raw : {};
  const wn =
    typeof base.wn === "number" && Number.isFinite(base.wn)
      ? Math.max(1, Math.floor(base.wn))
      : weekIndex + 1;
  const phase = normalizeTrainingPhase(typeof base.phase === "string" ? base.phase : undefined);
  const phaseLabel = trainingPhaseLabelDe(phase);
  const label =
    typeof base.label === "string" && base.label.trim()
      ? base.label.trim()
      : `Woche ${wn} · ${phaseLabel}`;
  const dates = typeof base.dates === "string" ? base.dates : "";
  const focus =
    typeof base.focus === "string" && base.focus.trim() ? base.focus.trim() : undefined;
  const isRecoveryWeek = base.isRecoveryWeek === true;

  return {
    wn,
    phase,
    label,
    dates,
    ...(focus ? { focus } : {}),
    ...(isRecoveryWeek ? { isRecoveryWeek } : {}),
  };
}

function weekMetaFromRawWeek(week: Record<string, unknown>, weekIndex: number): WeekV2["meta"] {
  const nested = isRecord(week.meta) ? week.meta : {};
  return normalizeWeekMeta(
    {
      wn: week.wn ?? nested.wn,
      phase: week.phase ?? nested.phase,
      label: week.label ?? nested.label,
      dates: week.dates ?? nested.dates,
      focus: week.focus ?? nested.focus,
      isRecoveryWeek: week.isRecoveryWeek ?? nested.isRecoveryWeek,
    },
    weekIndex,
  );
}

function sessionsFromRawWeek(week: Record<string, unknown>): unknown[] {
  if (Array.isArray(week.s)) return week.s;
  if (Array.isArray(week.workouts)) return week.workouts;
  return [];
}

function extractFromRawWeek(
  week: unknown,
  weekIndex: number,
  startIndex: number,
): { workouts: WorkoutV2[]; meta: WeekV2["meta"]; startIso?: string } {
  if (!isRecord(week)) {
    return { workouts: [], meta: normalizeWeekMeta({}, weekIndex) };
  }

  const workouts: WorkoutV2[] = [];
  let idx = startIndex;
  for (const session of sessionsFromRawWeek(week)) {
    const normalized = normalizeWorkout(session, idx++);
    if (normalized) workouts.push(normalized);
  }

  const meta = weekMetaFromRawWeek(week, weekIndex);
  const startIso =
    typeof week.startIso === "string" && week.startIso.length === 10 ? week.startIso : undefined;

  return { workouts, meta, startIso };
}

function dedupeWorkouts(workouts: WorkoutV2[]): WorkoutV2[] {
  const seen = new Set<string>();
  const out: WorkoutV2[] = [];
  for (let i = 0; i < workouts.length; i += 1) {
    const workout = workouts[i];
    let id = workout.id;
    if (seen.has(id)) {
      id = `${id}-dup-${i}`;
    }
    seen.add(id);
    out.push(id === workout.id ? workout : { ...workout, id });
  }
  return out;
}

function collectWorkoutsAndMeta(raw: unknown): {
  workouts: WorkoutV2[];
  metaByWeekStart: Map<string, WeekV2["meta"]>;
} {
  const workouts: WorkoutV2[] = [];
  const metaByWeekStart = new Map<string, WeekV2["meta"]>();
  let globalIndex = 0;

  const ingestWeek = (week: unknown, weekIndex: number) => {
    const extracted = extractFromRawWeek(week, weekIndex, globalIndex);
    globalIndex += extracted.workouts.length;
    workouts.push(...extracted.workouts);

    const weekStart =
      extracted.startIso ??
      (extracted.workouts[0] ? mondayIsoFromDateIso(extracted.workouts[0].dateIso) : null);
    if (weekStart) {
      metaByWeekStart.set(weekStart, extracted.meta);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach((week, weekIndex) => ingestWeek(week, weekIndex));
    return { workouts, metaByWeekStart };
  }

  if (!isRecord(raw)) {
    return { workouts, metaByWeekStart };
  }

  if (Array.isArray(raw.workouts)) {
    for (const workout of raw.workouts) {
      const normalized = normalizeWorkout(workout, globalIndex++);
      if (normalized) workouts.push(normalized);
    }
  }

  if (Array.isArray(raw.weeks)) {
    raw.weeks.forEach((week, weekIndex) => {
      if (!isRecord(week)) return;

      if (Array.isArray(week.workouts) && workouts.length === 0) {
        for (const workout of week.workouts) {
          const normalized = normalizeWorkout(workout, globalIndex++);
          if (normalized) workouts.push(normalized);
        }
      } else if (Array.isArray(week.s)) {
        const extracted = extractFromRawWeek(week, weekIndex, globalIndex);
        globalIndex += extracted.workouts.length;
        workouts.push(...extracted.workouts);
      }

      const meta = weekMetaFromRawWeek(week, weekIndex);
      const startIso =
        typeof week.startIso === "string" && week.startIso.length === 10
          ? week.startIso
          : (() => {
              const first = Array.isArray(week.workouts)
                ? week.workouts[0]
                : Array.isArray(week.s)
                  ? week.s[0]
                  : null;
              const normalizedFirst = normalizeWorkout(first, globalIndex);
              return normalizedFirst ? mondayIsoFromDateIso(normalizedFirst.dateIso) : null;
            })();
      if (startIso) metaByWeekStart.set(startIso, meta);
    });
  }

  return { workouts, metaByWeekStart };
}

function attachNormalizedMeta(
  plan: TrainingPlanV2,
  metaByWeekStart: Map<string, WeekV2["meta"]>,
): TrainingPlanV2 {
  return {
    ...plan,
    weeks: plan.weeks.map((week, idx) => ({
      ...week,
      meta: normalizeWeekMeta(
        {
          ...metaByWeekStart.get(week.startIso),
          ...week.meta,
        },
        idx,
      ),
    })),
  };
}

export const EMPTY_TRAINING_PLAN_V2: TrainingPlanV2 = {
  version: 2,
  workouts: [],
  weeks: [],
};

/**
 * Repairs legacy/partial plan payloads into a structurally complete TrainingPlanV2.
 * Safe for null, empty objects, legacy PlanWeek[] arrays, and mixed V2/display shapes.
 */
export function normalizeTrainingPlan(raw: unknown): TrainingPlanV2 {
  if (raw == null) return { ...EMPTY_TRAINING_PLAN_V2 };

  const { workouts, metaByWeekStart } = collectWorkoutsAndMeta(raw);
  const deduped = dedupeWorkouts(workouts);

  if (deduped.length === 0) {
    return { ...EMPTY_TRAINING_PLAN_V2 };
  }

  let plan = rebuildPlanFromWorkouts({ workouts: deduped, metaByWeekStart });
  plan = attachNormalizedMeta(plan, metaByWeekStart);

  if (!validateTrainingPlanV2Integrity(plan)) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[normalizeTrainingPlan] integrity check failed after rebuild; returning empty plan");
    }
    return { ...EMPTY_TRAINING_PLAN_V2 };
  }

  return plan;
}

/** Returns null when normalization yields an empty plan (caller may keep a fallback). */
export function normalizeTrainingPlanOrNull(raw: unknown): TrainingPlanV2 | null {
  const plan = normalizeTrainingPlan(raw);
  if (plan.workouts.length === 0) return null;
  return plan;
}
