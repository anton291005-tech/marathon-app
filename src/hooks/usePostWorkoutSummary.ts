import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAppNow } from "../core/time/timeSystem";
import { isSessionLogDone } from "../appSmartFeatures";
import type { StoredHealthRun } from "../healthRuns";
import { getStoredHealthRunCanonicalType } from "../healthRuns";
import {
  getSessionPlannedDistanceKm,
  resolveStructuredWorkoutSpecForSession,
} from "../sessionDistance";
import type { PlanSession } from "../marathonPrediction";
import {
  getPostWorkoutPlannedHr,
  plannedHrRangeForSessionType,
} from "../trainingIntelligence/sessionPlanTargets";
import {
  computeIntervalStructureAdherenceScore,
  computePlanAdherenceScore,
  parsePlannedPaceRangeSecPerKm,
  type PlanAdherenceScoreResult,
} from "../utils/planAdherenceScore";
import {
  safeReadLocalStorageItem,
  safeWriteLocalStorageJson,
} from "../persistence/safeLocalStorage";
import { resolveSessionPaceSecPerKm } from "../lib/ai/intervalPaceExtraction";
import { shouldUseIntervalScoring } from "../utils/workoutEvaluationGuards";
import { analyzeWorkout, type RecoveryPoint, type WorkoutTrendDatum } from "../ai/analysis";
import type { GpsPacePoint, SplitEntry, WorkoutLap } from "../ai/analysis/intervalSegmentExtractor";
import {
  extractIntervalMetrics,
  parseIntervalPlanInfo,
} from "../ai/analysis/intervalSegmentExtractor";
import { readMigrationFlags, writeMigrationFlags } from "../migrationFlags";
import { MARATHON_PREFERENCES_KEY } from "../persistence/marathonLocalStorageKeys";
import { parseBikeDurationSeconds } from "../utils/bikeDurationParser";

function coerceMaxHeartRateBpm(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function resolveMaxHeartRateBpm(explicit?: number | null): number | null {
  const fromArg = coerceMaxHeartRateBpm(explicit);
  if (fromArg != null) return fromArg;
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(MARATHON_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { maxHeartRateBpm?: unknown };
    return coerceMaxHeartRateBpm(parsed?.maxHeartRateBpm);
  } catch {
    // ignore quota / parse errors
  }
  return null;
}

/** Card-only HR row: async enricher sets this; adherence uses `actual.hrBpm` when present. */
export type PostWorkoutHrPresentation =
  | { kind: "bpm"; value: number }
  | { kind: "loading" }
  | { kind: "no_data" }
  | { kind: "open_settings"; onPress: () => void };

export type PostWorkoutSummary = {
  workoutId: string;
  workoutYmd: string;
  completedAtIso: string;
  session: {
    id: string;
    type: string;
    title: string;
    /** Workout recipe text (interval reps, WU/CD) — not the pace-only label. */
    desc?: string | null;
    paceLabel?: string | null;
    dateLabel: string;
  };
  planned: {
    distanceKm: number | null;
    paceSecPerKm: { min: number; max: number } | null;
    hrBpm: { min: number; max: number } | null;
    /** Zone label when defined (e.g. "Zone 4–5"); shown instead of bare "—" when HFmax is unset. */
    hrZoneLabel?: string | null;
  };
  actual: {
    distanceKm: number | null;
    paceSecPerKm: number | null;
    /** Actual workout duration in seconds — used for bike Zeit-Card display and time-accuracy scoring. */
    durationSec?: number | null;
    /** health.avgHeartRateBpm ?? log.assignedRun.avgHeartRateBpm ?? on-demand fetch (see `hrPresentation`) */
    hrBpm: number | null;
  };
  /** When set, Puls “Ist” row uses this instead of formatting `actual.hrBpm` alone. */
  hrPresentation?: PostWorkoutHrPresentation;
  adherence: ReturnType<typeof computePlanAdherenceScore>;
  ai?: {
    level2: ReturnType<typeof analyzeWorkout>["level2"] | null;
    level3: ReturnType<typeof analyzeWorkout>["level3"] | null;
    coach: ReturnType<typeof analyzeWorkout>["coach"] | null;
  } | null;
  /** Coach copy from persisted interval snapshot when live AI analysis is off. */
  fallbackIntervalCoachMessage?: string | null;
  /** Precomputed interval pace lines for summary UI (segments vs target). */
  intervalDisplay?: {
    avgPaceSecPerKm: number | null;
    targetPaceSecPerKm: number | null;
    intensityScore: number | null;
  } | null;
  /** User HFmax from marathonPreferences / profile — used for zone BPM display on the card. */
  maxHeartRateBpm?: number | null;
};

export function isEligibleWorkout(type: string): boolean {
  return type === "running" || type === "cycling";
}

export type PostWorkoutState = {
  lastShownWorkoutId: string | null;
  lastEvaluatedWorkoutId: string | null;
};

const LS_POST_WORKOUT_STATE = "postWorkoutSummary_state_v2";

const EMPTY_ADHERENCE: PlanAdherenceScoreResult = {
  score: 0,
  components: {},
  statuses: { pace: "na", distance: "na", hr: "na" },
};

/** Defensive shape for PostWorkoutSummaryCard after stale session recovery / partial enrichment. */
export function normalizePostWorkoutSummary(
  summary: PostWorkoutSummary | null | undefined,
): PostWorkoutSummary | null {
  if (!summary || typeof summary !== "object") return null;

  const session = summary.session && typeof summary.session === "object" ? summary.session : null;
  const workoutId = typeof summary.workoutId === "string" ? summary.workoutId.trim() : "";
  const workoutYmd = typeof summary.workoutYmd === "string" ? summary.workoutYmd.trim() : "";
  const completedAtIso = typeof summary.completedAtIso === "string" ? summary.completedAtIso.trim() : "";

  if (!session || !workoutId || !workoutYmd || !completedAtIso) return null;

  const planned =
    summary.planned && typeof summary.planned === "object"
      ? summary.planned
      : { distanceKm: null, paceSecPerKm: null, hrBpm: null, hrZoneLabel: null };
  const actual =
    summary.actual && typeof summary.actual === "object"
      ? summary.actual
      : { distanceKm: null, paceSecPerKm: null, hrBpm: null };
  const adherence =
    summary.adherence &&
    typeof summary.adherence === "object" &&
    typeof summary.adherence.score === "number" &&
    Number.isFinite(summary.adherence.score) &&
    summary.adherence.statuses &&
    typeof summary.adherence.statuses === "object"
      ? summary.adherence
      : computePlanAdherenceScore({
          plannedPaceSecPerKm: planned.paceSecPerKm ?? null,
          actualPaceSecPerKm: actual.paceSecPerKm ?? null,
          plannedDistanceKm: planned.distanceKm ?? null,
          actualDistanceKm: actual.distanceKm ?? null,
          plannedHrBpm: planned.hrBpm ?? null,
          actualHrBpm: actual.hrBpm ?? null,
        });

  return {
    ...summary,
    workoutId,
    workoutYmd,
    completedAtIso,
    session: {
      id: typeof session.id === "string" ? session.id : workoutId,
      type: typeof session.type === "string" ? session.type : "running",
      title: typeof session.title === "string" && session.title.trim() ? session.title : "Workout",
      desc: session.desc ?? null,
      paceLabel: session.paceLabel ?? null,
      dateLabel: typeof session.dateLabel === "string" ? session.dateLabel : workoutYmd,
    },
    planned: {
      distanceKm: planned.distanceKm ?? null,
      paceSecPerKm: planned.paceSecPerKm ?? null,
      hrBpm: planned.hrBpm ?? null,
      hrZoneLabel: planned.hrZoneLabel ?? null,
    },
    actual: {
      distanceKm: actual.distanceKm ?? null,
      paceSecPerKm: actual.paceSecPerKm ?? null,
      hrBpm: actual.hrBpm ?? null,
      durationSec: (actual as any).durationSec ?? null,
    },
    adherence: adherence ?? EMPTY_ADHERENCE,
  };
}

function safeLocalStorageGet(key: string): string | null {
  return safeReadLocalStorageItem(key);
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // ignore quota
  }
}

function safeLocalStorageSetJson(key: string, value: unknown): void {
  safeWriteLocalStorageJson(key, value);
}

function safeLocalStorageGetJson<T>(key: string): T | null {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type IntervalAnalysisContext = NonNullable<Parameters<typeof analyzeWorkout>[0]["intervalContext"]>;

function firstNonEmptyLapArray(
  ...sources: Array<WorkoutLap[] | null | undefined>
): WorkoutLap[] | null {
  for (const s of sources) {
    if (Array.isArray(s) && s.length > 0) return s;
  }
  return null;
}

function firstNonEmptyGpsStream(
  ...sources: Array<GpsPacePoint[] | null | undefined>
): GpsPacePoint[] | null {
  for (const s of sources) {
    if (Array.isArray(s) && s.length > 0) return s;
  }
  return null;
}

function firstNonEmptySplits(
  ...sources: Array<SplitEntry[] | null | undefined>
): SplitEntry[] | null {
  for (const s of sources) {
    if (Array.isArray(s) && s.length > 0) return s;
  }
  return null;
}

function intervalContextFromStoredHealth(
  sessionType: string,
  sessionTitle: string,
  planDescription: string | null | undefined,
  health: StoredHealthRun | null | undefined,
  assignedRun?: {
    laps?: WorkoutLap[];
    gpsStream?: GpsPacePoint[];
    splits?: SplitEntry[];
  } | null,
): IntervalAnalysisContext {
  const h = health;
  const ar = assignedRun;
  return {
    sessionType,
    sessionTitle,
    planDescription: planDescription ?? null,
    laps: firstNonEmptyLapArray(
      h && Array.isArray((h as StoredHealthRun & { laps?: WorkoutLap[] }).laps)
        ? (h as StoredHealthRun & { laps?: WorkoutLap[] }).laps
        : null,
      ar?.laps,
    ),
    gpsStream: firstNonEmptyGpsStream(
      h && Array.isArray((h as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream)
        ? (h as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream
        : null,
      ar?.gpsStream,
    ),
    splits: firstNonEmptySplits(
      h && Array.isArray((h as StoredHealthRun & { splits?: SplitEntry[] }).splits)
        ? (h as StoredHealthRun & { splits?: SplitEntry[] }).splits
        : null,
      ar?.splits,
    ),
  };
}

function toLocalDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function workoutEndDate(stored: StoredHealthRun): Date | null {
  const startMs = new Date(stored.startDate).getTime();
  const durationSec = Number(stored.duration) || 0;
  const endMs = startMs + durationSec * 1000;
  const d = new Date(endMs);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isAppleHealthOnlySource(stored: StoredHealthRun): boolean {
  const s = typeof stored.sourceName === "string" ? stored.sourceName.trim().toLowerCase() : "";
  // Strict: no inference if missing; unknown sources are discarded.
  if (!s) return false;
  return s.includes("apple");
}

/** Full recipe text for interval detection/scoring — desc holds reps/WU/CD, pace is target only. */
export function intervalPlanDescription(desc: string | null | undefined, pace: string | null | undefined): string | null {
  const parts = [typeof desc === "string" ? desc.trim() : "", typeof pace === "string" ? pace.trim() : ""].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

type HookArgs = {
  activeView: string;
  planSessions: Array<{ id: string; date: string; type: string; title: string; pace?: string | null; desc?: string | null; km?: number }>;
  logs: Record<string, any>;
  healthRuns: StoredHealthRun[];
  maxHeartRateBpm?: number | null;
  /** Optional: enables deterministic AI analysis output only. */
  aiAnalysisEnabled?: boolean;
  /** Optional: minimal recovery history points for trend analysis. */
  recoveryPoints?: RecoveryPoint[] | null;
};

export function usePostWorkoutSummary(args: HookArgs): {
  visible: boolean;
  summary: PostWorkoutSummary | null;
  dismiss: () => void;
  getPostWorkoutSummary: (workoutId: string, dayKey: string) => PostWorkoutSummary | null;
} {
  const appliedKeyRef = useRef<string | null>(null);
  const [summary, setSummary] = useState<PostWorkoutSummary | null>(null);
  const [visible, setVisible] = useState(false);

  const effectiveMaxHeartRateBpmArg = resolveMaxHeartRateBpm(args.maxHeartRateBpm);
  // eslint-disable-next-line no-console
  console.log("[HR-FIX] usePostWorkoutSummary call", {
    "args.maxHeartRateBpm": args.maxHeartRateBpm ?? null,
    effectiveMaxHeartRateBpm: effectiveMaxHeartRateBpmArg,
  });

  const healthById = useMemo(() => {
    const m = new Map<string, StoredHealthRun>();
    for (const r of args.healthRuns || []) {
      if (r?.runId) m.set(r.runId, r);
    }
    return m;
  }, [args.healthRuns]);

  const aiEnabled = args.aiAnalysisEnabled ?? (typeof process !== "undefined" ? process.env.REACT_APP_AI_ANALYSIS !== "0" : true);

  function expectedHrFromRange(range: { min: number; max: number } | null): number | null {
    if (!range) return null;
    const a = Number(range.min);
    const b = Number(range.max);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const mid = (Math.min(a, b) + Math.max(a, b)) / 2;
    return Number.isFinite(mid) && mid > 0 ? mid : null;
  }

  const buildTrendHistory = useCallback(
    (now: Date): WorkoutTrendDatum[] => {
      // Strict + deterministic: only workouts that are (a) plan-linked and (b) Apple Health running/cycling.
      // Safe fallback: if any input is missing, we skip the datum (no defaults).
      const cutoffMs = now.getTime() - 14 * 86400000;
      const byWorkoutId = new Map<string, { endMs: number; datum: WorkoutTrendDatum }>();

      for (const s of args.planSessions || []) {
        const log = args.logs?.[s.id];
        if (!isSessionLogDone(log)) continue;
        const ar = log?.assignedRun;
        const workoutId = typeof ar?.runId === "string" && ar.runId.length ? ar.runId : null;
        if (!workoutId) continue;
        const health = healthById.get(workoutId) ?? null;
        if (!health) continue;
        if (!isAppleHealthOnlySource(health)) continue;

        const rawType = typeof health.workoutType === "string" ? health.workoutType.trim().toLowerCase() : "";
        if (!rawType || !isEligibleWorkout(rawType)) continue;

        const end = workoutEndDate(health);
        if (!end) continue;
        const endMs = end.getTime();
        if (!Number.isFinite(endMs) || endMs < cutoffMs) continue;

        const plannedHr = plannedHrRangeForSessionType(
          s.type,
          resolveMaxHeartRateBpm(args.maxHeartRateBpm),
        );
        const expectedHr = expectedHrFromRange(plannedHr);

        const durationMin = numOrNull(ar?.duration ?? (health as any)?.duration);
        const durationMinutes = durationMin != null && durationMin > 0 ? durationMin / 60 : null;

        const actualPaceSecPerKm = (() => {
          const durationSec = numOrNull(ar?.duration ?? (health as any)?.duration);
          const km = (() => {
            const m = numOrNull((health as any).distanceMeters);
            if (m != null && m > 0) return m / 1000;
            const akm = numOrNull(ar?.distanceKm);
            return akm != null && akm > 0 ? akm : null;
          })();
          return resolveSessionPaceSecPerKm({
            sessionType: s.type,
            durationSec,
            distanceKm: km,
            laps: health?.laps ?? ar?.laps,
          });
        })();

        const plannedPace = parsePlannedPaceRangeSecPerKm(s.pace ?? null);
        const actualHrBpm =
          numOrNull((health as any)?.avgHeartRateBpm) ??
          numOrNull((log as any)?.assignedRun?.avgHeartRateBpm) ??
          null;

        const l2 = analyzeWorkout({
          workout: {
            durationMinutes: durationMinutes,
            actualHrBpm,
            expectedHrBpm: expectedHr,
            actualPaceSecPerKm,
            plannedPaceSecPerKm: plannedPace,
          },
          history: [],
          recovery: null,
          intervalContext: intervalContextFromStoredHealth(
            s.type,
            s.title,
            intervalPlanDescription(s.desc ?? null, s.pace ?? null),
            health,
            log?.assignedRun,
          ),
        }).level2;
        if (!l2) continue;

        const dayKey = toLocalDayKey(end);
        const datum: WorkoutTrendDatum = { date: dayKey, load: l2.load, effortRatio: l2.effortRatio };
        const prev = byWorkoutId.get(workoutId);
        if (!prev || endMs > prev.endMs) byWorkoutId.set(workoutId, { endMs, datum });
      }

      const list = Array.from(byWorkoutId.values()).map((x) => x.datum);
      list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return list;
    },
    [args.logs, args.maxHeartRateBpm, args.planSessions, healthById],
  );

  const computeLatestEligibleWorkoutIdForDayKey = useCallback((dayKey: string): string | null => {
    const candidates = (args.healthRuns || [])
      .map((w) => {
        if (!w?.runId) return null;
        if (!isAppleHealthOnlySource(w)) return null;
        const type = typeof w.workoutType === "string" ? w.workoutType.trim().toLowerCase() : "";
        if (!type || !isEligibleWorkout(type)) return null;
        const end = workoutEndDate(w);
        if (!end) return null;
        const isSameDay = toLocalDayKey(end) === dayKey;
        if (!isSameDay) return null;
        return { id: w.runId, endMs: end.getTime() };
      })
      .filter(Boolean) as Array<{ id: string; endMs: number }>;

    candidates.sort((a, b) => b.endMs - a.endMs);
    return candidates[0]?.id ?? null;
  }, [args.healthRuns]);

  const computeSummaryForWorkoutId = useCallback(
    (workoutId: string, dayKey: string): PostWorkoutSummary | null => {
      const effectiveMaxHeartRateBpm = resolveMaxHeartRateBpm(args.maxHeartRateBpm);

      const entries = (args.planSessions || [])
        .map((s) => {
          const log = args.logs?.[s.id];
          if (!isSessionLogDone(log)) return null;
          const atIso = typeof log?.at === "string" ? log.at : null;
          if (!atIso) return null;

          const ar = log?.assignedRun;
          const linkedRunId = typeof ar?.runId === "string" && ar.runId.length ? ar.runId : null;
          if (!linkedRunId || linkedRunId !== workoutId) return null;
          const health = healthById.get(linkedRunId) ?? null;

          // STRICT: Apple Health only + running/cycling only + same local day as now.
          if (!health || !isAppleHealthOnlySource(health)) return null;
          const rawType = typeof health.workoutType === "string" ? health.workoutType.trim().toLowerCase() : "";
          if (!rawType || !isEligibleWorkout(rawType)) return null;
          const end = workoutEndDate(health);
          if (!end) return null;
          const isSameDay = toLocalDayKey(end) === dayKey;
          if (!isSameDay) return null;

        // Actual distance / duration / HR (prefer health row if linked; else log payload).
        const actualDistanceKm =
          (linkedRunId && health && (getStoredHealthRunCanonicalType(health) === "run" || getStoredHealthRunCanonicalType(health) === "bike")
            ? numOrNull((health as any).distanceMeters) != null
              ? (Number((health as any).distanceMeters) || 0) / 1000
              : numOrNull(ar?.distanceKm)
            : numOrNull(ar?.distanceKm)) ??
          (() => {
            const parsed = parseFloat(String(log?.actualKm || "").replace(",", "."));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          })();

        const durationSec = numOrNull(ar?.duration ?? (health as any)?.duration) ?? null;
        const actualPaceSecPerKm = resolveSessionPaceSecPerKm({
          sessionType: s.type,
          durationSec,
          distanceKm: actualDistanceKm,
          laps: health?.laps ?? ar?.laps,
        });

        const actualHrBpm =
          numOrNull((health as any)?.avgHeartRateBpm) ??
          numOrNull((log as any)?.assignedRun?.avgHeartRateBpm) ??
          null;

        const plannedDistanceKm = (() => {
          // Bike: keine geplante Distanz — nur Ist-Wert anzeigen
          if (s.type === "bike") return null;
          // SSOT: structured + parsed desc (WU, reps, recovery, easy, CD) — not the stale plan-row km alone.
          try {
            const km = getSessionPlannedDistanceKm(s as any);
            return typeof km === "number" && Number.isFinite(km) && km > 0 ? km : null;
          } catch {
            return null;
          }
        })();
        const plannedPace = parsePlannedPaceRangeSecPerKm(s.pace ?? null);
        const plannedHrFields = getPostWorkoutPlannedHr({ type: s.type }, effectiveMaxHeartRateBpm);

        return {
          workoutId,
          workoutYmd: dayKey,
          completedAtIso: atIso,
          session: {
            id: s.id,
            type: s.type,
            title: s.title,
            desc: s.desc ?? null,
            paceLabel: s.pace ?? null,
            dateLabel: s.date,
          },
          planned: {
            distanceKm: plannedDistanceKm,
            paceSecPerKm: plannedPace,
            hrBpm: plannedHrFields.hrBpm,
            hrZoneLabel: plannedHrFields.hrZoneLabel,
          },
          actual: { distanceKm: actualDistanceKm, paceSecPerKm: actualPaceSecPerKm, hrBpm: actualHrBpm, durationSec },
          maxHeartRateBpm: effectiveMaxHeartRateBpm,
        };
        })
        .filter(Boolean) as Array<{
          workoutId: string;
          workoutYmd: string;
          completedAtIso: string;
          session: PostWorkoutSummary["session"];
          planned: PostWorkoutSummary["planned"];
          actual: PostWorkoutSummary["actual"];
          maxHeartRateBpm?: number | null;
        }>;

      // If multiple logs reference the same workout (should not happen), pick latest completion timestamp deterministically.
      entries.sort((a, b) => new Date(b.completedAtIso).getTime() - new Date(a.completedAtIso).getTime());
      const baseCore = entries[0] ?? null;
      if (!baseCore) return null;

      const planSessionRaw = (args.planSessions || []).find((ps) => ps.id === baseCore.session.id) as
        | (typeof args.planSessions)[0] & {
            laps?: WorkoutLap[];
            splits?: SplitEntry[];
          }
        | undefined;
      const logSessionRaw = args.logs?.[baseCore.session.id] as
        | {
            assignedRun?: {
              runId?: string;
              laps?: WorkoutLap[];
              splits?: SplitEntry[];
              gpsStream?: GpsPacePoint[];
              [key: string]: unknown;
            };
          }
        | undefined;
      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] usePostWorkoutSummary — session pipeline inputs", {
        sessionId: baseCore.session.id,
        sessionType: baseCore.session.type,
        sessionTitle: baseCore.session.title,
        sessionDesc: baseCore.session.desc ?? null,
        sessionPaceLabel: baseCore.session.paceLabel ?? null,
        planSessionLaps: planSessionRaw?.laps?.length ?? null,
        planSessionSplits: planSessionRaw?.splits?.length ?? null,
        assignedRunKeys: logSessionRaw?.assignedRun
          ? Object.keys(logSessionRaw.assignedRun)
          : null,
        assignedRunLaps: logSessionRaw?.assignedRun?.laps?.length ?? null,
        assignedRunSplits: logSessionRaw?.assignedRun?.splits?.length ?? null,
        assignedRunGpsStream: logSessionRaw?.assignedRun?.gpsStream?.length ?? null,
        maxHeartRateBpmArg: args.maxHeartRateBpm ?? null,
        effectiveMaxHeartRateBpm,
      });

      const healthForIv = healthById.get(workoutId) ?? null;
      const logForIv = args.logs?.[baseCore.session.id] as
        | { assignedRun?: { laps?: WorkoutLap[]; gpsStream?: GpsPacePoint[]; splits?: SplitEntry[] } }
        | undefined;
      const ivCtx = intervalContextFromStoredHealth(
        baseCore.session.type,
        baseCore.session.title,
        intervalPlanDescription(baseCore.session.desc ?? null, baseCore.session.paceLabel ?? null),
        healthForIv,
        logForIv?.assignedRun,
      );
      const intervalSnapshot = healthForIv?.intervalIntensitySnapshot;
      const runAnalyzeBecauseInterval = shouldUseIntervalScoring({
        sessionType: baseCore.session.type,
        sessionTitle: baseCore.session.title,
        planDescription: intervalPlanDescription(baseCore.session.desc ?? null, baseCore.session.paceLabel ?? null),
      });
      const mustRunAnalysis = aiEnabled || runAnalyzeBecauseInterval;

      if (!mustRunAnalysis) {
        const adherenceSimple = computePlanAdherenceScore({
          plannedPaceSecPerKm: baseCore.planned.paceSecPerKm,
          actualPaceSecPerKm: baseCore.actual.paceSecPerKm,
          plannedDistanceKm: baseCore.planned.distanceKm,
          actualDistanceKm:
            baseCore.actual.distanceKm != null ? Math.round(baseCore.actual.distanceKm * 100) / 100 : null,
          plannedHrBpm: baseCore.planned.hrBpm,
          actualHrBpm: baseCore.actual.hrBpm,
          sessionType: baseCore.session.type,
          actualDurationSec: baseCore.actual.durationSec ?? null,
          plannedDurationSec:
            baseCore.session.type === "bike"
              ? parseBikeDurationSeconds(baseCore.session.desc ?? undefined)
              : null,
        });
        // eslint-disable-next-line no-console
        console.log("[PWS-DIAG:HR] usePostWorkoutSummary — planned HR before return (no analysis path)", {
          hrZoneLabel: baseCore.planned.hrZoneLabel ?? null,
          hrBpm: baseCore.planned.hrBpm ?? null,
          maxHeartRateBpm: args.maxHeartRateBpm ?? baseCore.maxHeartRateBpm ?? null,
        });
        const coreWithHr = {
          ...baseCore,
          maxHeartRateBpm: effectiveMaxHeartRateBpm,
          planned: {
            ...baseCore.planned,
            ...getPostWorkoutPlannedHr({ type: baseCore.session.type }, effectiveMaxHeartRateBpm),
          },
        };
        // eslint-disable-next-line no-console
        console.log("[HR-FIX] planned HR passed to card:", coreWithHr.planned.hrBpm, coreWithHr.planned.hrZoneLabel);
        return { ...coreWithHr, adherence: adherenceSimple, ai: null, fallbackIntervalCoachMessage: null, intervalDisplay: null };
      }

      const now = getAppNow();
      const history = buildTrendHistory(now);

      if (process.env.NODE_ENV === "development" || process.env.REACT_APP_DEBUG_AI === "1") {
        const preAnalysisDebug = {
          workoutId: baseCore.workoutId,
          workoutDate: baseCore.workoutYmd,
          workoutType: baseCore.session.type,
          actualPace: baseCore.actual.paceSecPerKm,
          plannedPace: baseCore.planned.paceSecPerKm,
          actualDistance: baseCore.actual.distanceKm,
          plannedDistance: baseCore.planned.distanceKm,
          actualHeartRate: baseCore.actual.hrBpm,
          plannedHeartRateZone: baseCore.planned.hrBpm,
          historyPoints: history.length,
        };
        // eslint-disable-next-line no-console
        console.log("[PostWorkoutSummary] Pre-analysis data:", preAnalysisDebug);
        if (baseCore.actual.hrBpm == null) {
          // eslint-disable-next-line no-console
          console.warn(
            `[PostWorkoutSummary] HR query returned nil — check HealthKit authorization for heartRate read permission (workoutId: ${baseCore.workoutId})`,
          );
        }
      }

      const analysis = analyzeWorkout({
        workout: {
          durationMinutes: (() => {
            const ar = (args.logs?.[baseCore.session.id] as any)?.assignedRun;
            const durationSec = numOrNull(ar?.duration);
            return durationSec != null && durationSec > 0 ? durationSec / 60 : null;
          })(),
          actualHrBpm: baseCore.actual.hrBpm,
          expectedHrBpm: expectedHrFromRange(baseCore.planned.hrBpm),
          actualPaceSecPerKm: baseCore.actual.paceSecPerKm,
          plannedPaceSecPerKm: baseCore.planned.paceSecPerKm,
        },
        history,
        recovery: args.recoveryPoints ?? null,
        intervalContext: ivCtx,
      });

      const l2 = analysis.level2;
      const analysisIsInterval = l2?.model === "interval";
      const analysisInsufficient =
        analysisIsInterval && l2?.signalSource === "insufficient_data";
      let intervalIntensityScore =
        (analysisIsInterval && typeof l2?.intensityScore === "number" ? l2.intensityScore : null) ??
        (intervalSnapshot?.scoringVersion === "interval_v2" && typeof intervalSnapshot.intensityScore === "number"
          ? intervalSnapshot.intensityScore
          : null);

      const intervalAvgFromAnalysis =
        analysisIsInterval &&
        typeof l2?.intervalMeta?.avgIntervalPace === "number" &&
        l2.intervalMeta!.avgIntervalPace > 0
          ? l2.intervalMeta.avgIntervalPace
          : null;
      const intervalAvgFromPersisted =
        typeof intervalSnapshot?.avgIntervalPaceSecPerKm === "number" && intervalSnapshot.avgIntervalPaceSecPerKm > 0
          ? intervalSnapshot.avgIntervalPaceSecPerKm
          : null;
      const planDescForIv = intervalPlanDescription(
        baseCore.session.desc ?? null,
        baseCore.session.paceLabel ?? null,
      );
      // interval-only pace, do not include warm-up/cool-down/recovery — DO NOT REGRESS
      let intervalAvgFromSegments: number | null = null;
      let intervalIntensityFromSegments: number | null = null;
      let segmentFallbackPath: string | null = null;
      if (
        runAnalyzeBecauseInterval &&
        intervalAvgFromAnalysis == null &&
        intervalAvgFromPersisted == null
      ) {
        // eslint-disable-next-line no-console
        const assignedRunGpsStream = logForIv?.assignedRun?.gpsStream ?? null;
        const healthGpsStream =
          healthForIv && Array.isArray((healthForIv as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream)
            ? (healthForIv as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream
            : null;
        const gpsStreamForSegments =
          firstNonEmptyGpsStream(assignedRunGpsStream, healthGpsStream, ivCtx.gpsStream) ?? null;
        const parsedPlanInfo = parseIntervalPlanInfo(planDescForIv);
        const repCountForSegments = parsedPlanInfo?.repCount ?? null;
        const repDistanceMForSegments = parsedPlanInfo?.repDistance ?? null;
        // eslint-disable-next-line no-console
        console.log("[PWS-DIAG:PACE] usePostWorkoutSummary — attempting segment extraction (A→E via extractIntervalMetrics)", {
          planDescForIv,
          ivCtxLaps: ivCtx.laps?.length ?? 0,
          ivCtxSplits: ivCtx.splits?.length ?? 0,
          ivCtxGpsStream: ivCtx.gpsStream?.length ?? 0,
          assignedRunGpsStreamPoints: assignedRunGpsStream?.length ?? 0,
          gpsStreamForSegmentsPoints: gpsStreamForSegments?.length ?? 0,
          repCountForSegments,
          repDistanceMForSegments,
          intervalAvgFromAnalysis,
          intervalAvgFromPersisted,
        });
        const assignedRunForIv = logForIv?.assignedRun as
          | { duration?: number; distanceKm?: number; distanceMeters?: number }
          | undefined;
        const totalDurationSec = numOrNull(assignedRunForIv?.duration);
        const totalDistanceMeters =
          numOrNull(assignedRunForIv?.distanceMeters) ??
          (numOrNull(assignedRunForIv?.distanceKm) != null
            ? (assignedRunForIv!.distanceKm as number) * 1000
            : numOrNull((healthForIv as { distanceMeters?: number } | null)?.distanceMeters));
        const planSessionForStructure = (args.planSessions || []).find(
          (ps) => ps.id === baseCore.session.id,
        );
        const structuredWorkout = planSessionForStructure
          ? resolveStructuredWorkoutSpecForSession({
              type: planSessionForStructure.type,
              desc: baseCore.session.desc ?? planSessionForStructure.desc ?? null,
              structured:
                (planSessionForStructure as { structured?: unknown }).structured ?? null,
              km: planSessionForStructure.km ?? 0,
            })
          : resolveStructuredWorkoutSpecForSession({
              type: baseCore.session.type,
              desc: baseCore.session.desc,
              km: 0,
            });
        const segmentMetrics = extractIntervalMetrics(
          ivCtx.laps ?? null,
          gpsStreamForSegments,
          ivCtx.splits ?? null,
          planDescForIv,
          {
            repCount: repCountForSegments ?? undefined,
            repDistanceM: repDistanceMForSegments ?? undefined,
          },
          {
            totalDurationSec,
            totalDistanceMeters,
            structuredWorkout,
          },
        );
        intervalAvgFromSegments = segmentMetrics.avgPaceSecPerKm;
        intervalIntensityFromSegments = segmentMetrics.intensityScore;
        segmentFallbackPath =
          segmentMetrics.extraction?.extractionStrategy === "structure_estimated"
            ? "strategy-f:structure-estimated"
            : segmentMetrics.extraction
              ? `segments:${segmentMetrics.extraction.extractionStrategy}`
              : "segments:none";
        // eslint-disable-next-line no-console
        console.log("[PWS-DIAG:PACE] usePostWorkoutSummary — segment extraction result", {
          segmentFallbackPath,
          extractionStrategy: segmentMetrics.extraction?.extractionStrategy ?? "none",
          effortSegments: segmentMetrics.extraction?.effortSegments.length ?? 0,
          intervalAvgFromSegments,
          intervalIntensityFromSegments,
        });
      } else {
        // eslint-disable-next-line no-console
        console.log("[PWS-DIAG:PACE] usePostWorkoutSummary — segment extraction skipped", {
          runAnalyzeBecauseInterval,
          intervalAvgFromAnalysis,
          intervalAvgFromPersisted,
          reason: !runAnalyzeBecauseInterval
            ? "not an interval session"
            : intervalAvgFromAnalysis != null
              ? "using analysis avgIntervalPace"
              : "using persisted snapshot avgIntervalPaceSecPerKm",
        });
      }
      let intervalAvg = intervalAvgFromAnalysis ?? intervalAvgFromPersisted ?? intervalAvgFromSegments;
      if (
        intervalAvg == null &&
        runAnalyzeBecauseInterval &&
        baseCore.actual.paceSecPerKm != null &&
        Number.isFinite(baseCore.actual.paceSecPerKm)
      ) {
        intervalAvg = baseCore.actual.paceSecPerKm;
      }

      const plannedPaceMidSec =
        baseCore.planned.paceSecPerKm &&
        Number.isFinite(baseCore.planned.paceSecPerKm.min) &&
        Number.isFinite(baseCore.planned.paceSecPerKm.max)
          ? (Math.min(baseCore.planned.paceSecPerKm.min, baseCore.planned.paceSecPerKm.max) +
              Math.max(baseCore.planned.paceSecPerKm.min, baseCore.planned.paceSecPerKm.max)) /
            2
          : null;

      const strategyFUsed = segmentFallbackPath === "strategy-f:structure-estimated";

      if (
        intervalIntensityFromSegments != null &&
        (intervalIntensityScore == null || analysisInsufficient) &&
        !strategyFUsed
      ) {
        intervalIntensityScore = intervalIntensityFromSegments;
      }

      if (
        strategyFUsed &&
        intervalAvg != null &&
        plannedPaceMidSec != null &&
        Number.isFinite(plannedPaceMidSec) &&
        baseCore.actual.hrBpm == null
      ) {
        intervalIntensityScore = computeIntervalStructureAdherenceScore({
          intervalAvgPaceSecPerKm: intervalAvg,
          plannedPaceMidSec,
          actualDistanceKm: baseCore.actual.distanceKm,
          plannedDistanceKm: baseCore.planned.distanceKm,
        });
      } else if (
        strategyFUsed &&
        intervalIntensityFromSegments != null &&
        (intervalIntensityScore == null || analysisInsufficient)
      ) {
        intervalIntensityScore = intervalIntensityFromSegments;
      }

      if (process.env.NODE_ENV === "development" || process.env.REACT_APP_DEBUG_AI === "1") {
        // eslint-disable-next-line no-console
        console.log("[PostWorkoutSummary] Interval segment sources:", {
          sessionLaps: logForIv?.assignedRun?.laps?.length ?? 0,
          healthLaps: (healthForIv?.laps as WorkoutLap[] | undefined)?.length ?? 0,
          sessionSplits: logForIv?.assignedRun?.splits?.length ?? 0,
          healthSplits: (healthForIv?.splits as SplitEntry[] | undefined)?.length ?? 0,
          sessionGps: logForIv?.assignedRun?.gpsStream?.length ?? 0,
          healthGps: (
            (healthForIv as StoredHealthRun & { gpsStream?: GpsPacePoint[] } | null)?.gpsStream as
              | GpsPacePoint[]
              | undefined
          )?.length ?? 0,
          segmentFallbackPath,
          intervalAvgFromAnalysis,
          intervalAvgFromPersisted,
          intervalAvgFromSegments,
          intervalIntensityFromSegments,
          intervalIntensityScore,
        });
      }

      const adherence = computePlanAdherenceScore({
        plannedPaceSecPerKm: baseCore.planned.paceSecPerKm,
        actualPaceSecPerKm: baseCore.actual.paceSecPerKm,
        plannedDistanceKm: baseCore.planned.distanceKm,
        actualDistanceKm:
          baseCore.actual.distanceKm != null ? Math.round(baseCore.actual.distanceKm * 100) / 100 : null,
        plannedHrBpm: baseCore.planned.hrBpm,
        actualHrBpm: baseCore.actual.hrBpm,
        useIntervalPaceMetric: runAnalyzeBecauseInterval && typeof intervalIntensityScore === "number",
        intervalIntensityScore0_100: typeof intervalIntensityScore === "number" ? intervalIntensityScore : null,
        intervalAvgPaceSecPerKm: intervalAvg,
        sessionType: baseCore.session.type,
        actualDurationSec: baseCore.actual.durationSec ?? null,
        plannedDurationSec:
          baseCore.session.type === "bike"
            ? parseBikeDurationSeconds(baseCore.session.desc ?? undefined)
            : null,
      });

      if (process.env.NODE_ENV === "development" || process.env.REACT_APP_DEBUG_AI === "1") {
        const isIntervalWorkout = analysisIsInterval;
        if (isIntervalWorkout) {
          // eslint-disable-next-line no-console
          console.log("[PostWorkoutSummary] Interval analysis:", {
            isIntervalWorkout,
            score: l2?.intensityScore ?? null,
            completedReps: l2?.intervalMeta?.completedReps ?? null,
            targetReps: l2?.intervalMeta?.targetReps ?? null,
            extractionStrategy: l2?.intervalMeta?.extractionStrategy ?? null,
            intervalMeta: l2?.intervalMeta ?? null,
          });
        }
      }

      const snapCoachRaw =
        typeof intervalSnapshot?.coachMessage === "string" ? intervalSnapshot.coachMessage.trim() : "";

      const strategyFCoachNote =
        "Pace geschätzt aus Gesamtzeit und Planstruktur (keine Lap-Daten verfügbar)";

      let intervalTargetSec: number | null = null;
      if (analysisIsInterval && typeof l2?.intervalMeta?.targetPace === "number" && l2.intervalMeta.targetPace > 0) {
        intervalTargetSec = l2.intervalMeta.targetPace;
      } else if (
        typeof intervalSnapshot?.targetPaceSecPerKm === "number" &&
        intervalSnapshot.targetPaceSecPerKm > 0
      ) {
        intervalTargetSec = intervalSnapshot.targetPaceSecPerKm;
      } else if (plannedPaceMidSec != null && Number.isFinite(plannedPaceMidSec)) {
        intervalTargetSec = plannedPaceMidSec;
      }

      const intervalDisplayOut = runAnalyzeBecauseInterval
        ? {
            avgPaceSecPerKm: intervalAvg,
            targetPaceSecPerKm: intervalTargetSec,
            intensityScore: typeof intervalIntensityScore === "number" ? intervalIntensityScore : null,
          }
        : null;

      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:PACE] usePostWorkoutSummary — final pace values for card", {
        intervalAvgPaceSec: intervalAvg,
        intervalAvgPaceSecPerKm: intervalAvg,
        plannedPaceSecPerKm: baseCore.planned.paceSecPerKm,
        plannedPaceMidSec: intervalTargetSec,
        intervalDisplay: intervalDisplayOut,
        actualPaceSecPerKm: baseCore.actual.paceSecPerKm,
        segmentFallbackPath,
      });

      // eslint-disable-next-line no-console
      console.log("[PWS-DIAG:HR] usePostWorkoutSummary — planned HR before return", {
        hrZoneLabel: baseCore.planned.hrZoneLabel ?? null,
        hrBpm: baseCore.planned.hrBpm ?? null,
        maxHeartRateBpm: args.maxHeartRateBpm ?? baseCore.maxHeartRateBpm ?? null,
      });

      const plannedHrResolved = getPostWorkoutPlannedHr(
        { type: baseCore.session.type },
        effectiveMaxHeartRateBpm,
      );

      // eslint-disable-next-line no-console
      console.log("[HR-FIX] planned HR passed to card:", plannedHrResolved.hrBpm, plannedHrResolved.hrZoneLabel);

      const aiOut = aiEnabled
        ? {
            level2: analysis.level2,
            level3: analysis.level3,
            coach: analysis.coach ? { ...analysis.coach } : null,
          }
        : null;
      if (strategyFUsed && aiOut?.coach?.message) {
        aiOut.coach.message = `${aiOut.coach.message} ${strategyFCoachNote}`;
      }

      let fallbackIntervalCoachMessage: string | null =
        runAnalyzeBecauseInterval && !aiEnabled && snapCoachRaw.length > 0 ? snapCoachRaw : null;
      if (strategyFUsed) {
        fallbackIntervalCoachMessage = fallbackIntervalCoachMessage
          ? `${fallbackIntervalCoachMessage} ${strategyFCoachNote}`
          : strategyFCoachNote;
      }

      return {
        ...baseCore,
        planned: {
          ...baseCore.planned,
          hrBpm: plannedHrResolved.hrBpm,
          hrZoneLabel: plannedHrResolved.hrZoneLabel,
        },
        maxHeartRateBpm: effectiveMaxHeartRateBpm,
        adherence,
        ai: aiOut,
        fallbackIntervalCoachMessage,
        intervalDisplay: intervalDisplayOut,
      };
    },
    [aiEnabled, args.logs, args.maxHeartRateBpm, args.planSessions, args.recoveryPoints, buildTrendHistory, healthById],
  );

  const loadState = useCallback((): PostWorkoutState => {
    const parsed = safeLocalStorageGetJson<PostWorkoutState>(LS_POST_WORKOUT_STATE);
    if (
      parsed &&
      Object.prototype.hasOwnProperty.call(parsed, "lastShownWorkoutId") &&
      Object.prototype.hasOwnProperty.call(parsed, "lastEvaluatedWorkoutId")
    ) {
      return {
        lastShownWorkoutId: parsed.lastShownWorkoutId ?? null,
        lastEvaluatedWorkoutId: parsed.lastEvaluatedWorkoutId ?? null,
      };
    }
    return { lastShownWorkoutId: null, lastEvaluatedWorkoutId: null };
  }, []);

  const saveState = useCallback((next: PostWorkoutState) => {
    safeLocalStorageSetJson(LS_POST_WORKOUT_STATE, next);
  }, []);

  useEffect(() => {
    if (args.activeView !== "home") return;
    const now = getAppNow();
    const todayDayKey = toLocalDayKey(now);

    if (process.env.NODE_ENV === "development") {
      const flags = readMigrationFlags();
      const forceIdRaw = flags.forcePostWorkoutCardForWorkoutId;
      const forceId = typeof forceIdRaw === "string" ? forceIdRaw.trim() : "";
      if (forceId.length > 0) {
        const forcedSummary = computeSummaryForWorkoutId(forceId, todayDayKey);
        if (forcedSummary) {
          const nextFlags = { ...flags, forcePostWorkoutCardForWorkoutId: null };
          writeMigrationFlags(nextFlags);
          const normalizedForced = normalizePostWorkoutSummary(forcedSummary);
          if (!normalizedForced) return;
          setSummary(normalizedForced);
          setVisible(true);
          appliedKeyRef.current = `${forceId}:${todayDayKey}`;
          saveState({
            lastShownWorkoutId: forceId,
            lastEvaluatedWorkoutId: forceId,
          });
          return;
        }
      }
    }

    const workoutId = computeLatestEligibleWorkoutIdForDayKey(todayDayKey);
    if (!workoutId) {
      setVisible(false);
      setSummary(null);
      appliedKeyRef.current = null;
      return;
    }

    const latestKey = `${workoutId}:${todayDayKey}`;
    if (appliedKeyRef.current === latestKey && visible && summary?.workoutId === workoutId) {
      const refreshed = computeSummaryForWorkoutId(workoutId, todayDayKey);
      if (
        refreshed &&
        (refreshed.maxHeartRateBpm !== summary.maxHeartRateBpm ||
          JSON.stringify(refreshed.planned.hrBpm) !== JSON.stringify(summary.planned.hrBpm))
      ) {
        setSummary(refreshed);
      }
      return;
    }

    const state = loadState();
    const isFirstEligibleEvaluation =
      workoutId !== state.lastShownWorkoutId && workoutId !== state.lastEvaluatedWorkoutId;

    const computed = computeSummaryForWorkoutId(workoutId, todayDayKey);
    const workoutCompleted = computed != null;

    if (!workoutCompleted) {
      setVisible(false);
      setSummary(null);
      appliedKeyRef.current = latestKey;
      return;
    }

    // After evaluation: always persist lastEvaluatedWorkoutId.
    const nextEvaluatedState: PostWorkoutState = {
      lastShownWorkoutId: state.lastShownWorkoutId,
      lastEvaluatedWorkoutId: workoutId,
    };
    saveState(nextEvaluatedState);

    appliedKeyRef.current = latestKey;

    // Authoritative final trigger condition:
    // workoutCompleted && isEligibleWorkout(workout.type) && workout.source === "apple_health" && isSameDay && isFirstEligibleEvaluation
    if (isFirstEligibleEvaluation) {
      // Only mark shown if card is actually shown.
      saveState({ ...nextEvaluatedState, lastShownWorkoutId: workoutId });
      const normalized = normalizePostWorkoutSummary(computed);
      if (!normalized) {
        setVisible(false);
        setSummary(null);
        return;
      }
      setSummary(normalized);
      setVisible(true);
    } else {
      setVisible(false);
      setSummary(null);
    }
  }, [
    args.activeView,
    args.maxHeartRateBpm,
    computeLatestEligibleWorkoutIdForDayKey,
    computeSummaryForWorkoutId,
    loadState,
    saveState,
    summary?.workoutId,
    summary?.maxHeartRateBpm,
    summary?.planned?.hrBpm,
    visible,
  ]);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, summary, dismiss, getPostWorkoutSummary: computeSummaryForWorkoutId };
}

