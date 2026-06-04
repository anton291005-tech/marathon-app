import { getAppNow } from "../../core/time/timeSystem";
import { isSessionLogDone } from "../../appSmartFeatures";
import type { IntervalIntensitySnapshot, StoredHealthRun } from "../../healthRuns";
import { getStoredHealthRunCanonicalType } from "../../healthRuns";
import { parsePlannedPaceRangeSecPerKm } from "../../utils/planAdherenceScore";
import { analyzeWorkout } from "./analyzeWorkout";
import { detectIntervalWorkout, extractIntervalSegments } from "./intervalSegmentExtractor";
import type { GpsPacePoint, SplitEntry, WorkoutLap } from "./intervalSegmentExtractor";
import { intervalPlanDescription } from "../../hooks/usePostWorkoutSummary";

const INTERVAL_TITLE_KEYWORDS =
  /interval|intervall|repeat|repetition|wiederholung|tempo|track|series/i;

export type BackfillIntervalWorkoutScoresArgs = {
  healthRuns: StoredHealthRun[];
  planSessions: Array<{ id: string; date: string; type: string; title: string; pace?: string | null; km?: number }>;
  logs: Record<string, unknown>;
  maxHeartRateBpm?: number | null;
};

export type BackfillIntervalWorkoutScoresResult = {
  healthRuns: StoredHealthRun[];
  rescored: number;
  skippedNoSegments: number;
  unchanged: number;
  mutated: boolean;
  /** Sparse session-log patches keyed by session id (`marathonLogs` shape). */
  mutatedSessionLogs?: Record<string, unknown>;
};

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function plannedHrRangeForSessionType(
  sessionType: string,
  maxHrBpm: number | null | undefined,
): { min: number; max: number } | null {
  const mh = typeof maxHrBpm === "number" && Number.isFinite(maxHrBpm) && maxHrBpm > 80 ? maxHrBpm : null;
  if (!mh) return null;
  const t = String(sessionType || "").toLowerCase();
  if (t === "easy" || t === "long") return { min: Math.round(mh * 0.65), max: Math.round(mh * 0.78) };
  if (t === "tempo") return { min: Math.round(mh * 0.82), max: Math.round(mh * 0.9) };
  if (t === "interval") return { min: Math.round(mh * 0.88), max: Math.round(mh * 0.95) };
  if (t === "race") return { min: Math.round(mh * 0.9), max: Math.round(mh * 0.97) };
  if (t === "bike") return { min: Math.round(mh * 0.6), max: Math.round(mh * 0.78) };
  return null;
}

function expectedHrFromRange(range: { min: number; max: number } | null): number | null {
  if (!range) return null;
  const a = Number(range.min);
  const b = Number(range.max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mid = (Math.min(a, b) + Math.max(a, b)) / 2;
  return Number.isFinite(mid) && mid > 0 ? mid : null;
}

function collectLinkedSessions(
  logs: Record<string, unknown>,
  runId: string,
): Array<{ sessionId: string; log: Record<string, unknown> }> {
  const out: Array<{ sessionId: string; log: Record<string, unknown> }> = [];
  for (const [sessionId, log] of Object.entries(logs || {})) {
    if (!log || typeof log !== "object") continue;
    const lid = log as { assignedRun?: { runId?: string }; done?: boolean };
    const rid = lid?.assignedRun?.runId;
    if (typeof rid !== "string" || rid !== runId) continue;
    if (!isSessionLogDone(log)) continue;
    out.push({ sessionId, log: log as Record<string, unknown> });
  }
  out.sort((a, b) => String(a.sessionId).localeCompare(String(b.sessionId)));
  return out;
}

function pickFlaggedPlanSession(
  linked: Array<{ sessionId: string; log: Record<string, unknown> }>,
  planSessions: BackfillIntervalWorkoutScoresArgs["planSessions"],
  snapshot: IntervalIntensitySnapshot | undefined,
): (typeof planSessions)[0] | null {
  for (const { sessionId } of linked) {
    const session = planSessions.find((s) => s.id === sessionId);
    if (!session) continue;

    const paceLabel = session.pace ?? null;
    const detect = detectIntervalWorkout(session.type, session.title, paceLabel);
    const blob = `${session.type || ""} ${session.title || ""}`;
    const kwHit = INTERVAL_TITLE_KEYWORDS.test(blob);
    const anomaly =
      kwHit &&
      typeof snapshot?.intensityScore === "number" &&
      snapshot.intensityScore < 65 &&
      snapshot.scoringVersion !== "interval_v2";

    if (detect || anomaly) return session;
  }
  return null;
}

function buildAnalyzeInputs(args: {
  session: BackfillIntervalWorkoutScoresArgs["planSessions"][0];
  health: StoredHealthRun;
  log: Record<string, unknown>;
  maxHeartRateBpm?: number | null;
}): {
  workout: {
    durationMinutes: number | null;
    actualHrBpm: number | null;
    expectedHrBpm: number | null;
    actualPaceSecPerKm: number | null;
    plannedPaceSecPerKm: { min: number; max: number } | null;
  };
  intervalContext: {
    sessionType: string;
    sessionTitle: string;
    planDescription: string | null;
    laps: WorkoutLap[] | null;
    gpsStream: GpsPacePoint[] | null;
    splits: SplitEntry[] | null;
  };
} | null {
  const { session, health, log, maxHeartRateBpm } = args;
  const ar = log.assignedRun as { duration?: number; distanceKm?: number } | undefined;

  const durationSec =
    numOrNull(ar?.duration ?? health.duration) ??
    null;
  const durationMinutes = durationSec != null && durationSec > 0 ? durationSec / 60 : null;
  if (!durationMinutes) return null;

  const actualDistanceKm =
    numOrNull(health.distanceMeters) != null && Number(health.distanceMeters) > 0
      ? Number(health.distanceMeters) / 1000
      : numOrNull(ar?.distanceKm);

  const actualPaceSecPerKm =
    actualDistanceKm != null && actualDistanceKm > 0.01 && durationSec != null && durationSec > 0
      ? durationSec / actualDistanceKm
      : null;

  const actualHrBpm = numOrNull(health.avgHeartRateBpm) ?? null;
  const plannedHr = plannedHrRangeForSessionType(session.type, maxHeartRateBpm);

  return {
    workout: {
      durationMinutes,
      actualHrBpm,
      expectedHrBpm: expectedHrFromRange(plannedHr),
      actualPaceSecPerKm,
      plannedPaceSecPerKm: parsePlannedPaceRangeSecPerKm(session.pace ?? null),
    },
    intervalContext: {
      sessionType: session.type,
      sessionTitle: session.title,
      planDescription: session.pace ?? null,
      laps: Array.isArray((health as StoredHealthRun & { laps?: WorkoutLap[] }).laps)
        ? (health as StoredHealthRun & { laps?: WorkoutLap[] }).laps!
        : null,
      gpsStream: Array.isArray((health as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream)
        ? (health as StoredHealthRun & { gpsStream?: GpsPacePoint[] }).gpsStream!
        : null,
      splits: Array.isArray(health.splits) ? health.splits : null,
    },
  };
}

async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * One-time migration: re-score interval workouts using segment-based intensity (interval_v2).
 * Sequential writes; tolerates per-row failures.
 */
export async function backfillIntervalWorkoutScores(
  args: BackfillIntervalWorkoutScoresArgs,
): Promise<BackfillIntervalWorkoutScoresResult> {
  const next = args.healthRuns.map((r) => ({ ...r }));
  let rescored = 0;
  let skippedNoSegments = 0;
  let unchanged = 0;
  let mutated = false;
  const mutatedSessionLogs: Record<string, unknown> = {};

  for (let idx = 0; idx < next.length; idx++) {
    const run = next[idx];
    if (!run?.runId || getStoredHealthRunCanonicalType(run) !== "run") continue;

    const linked = collectLinkedSessions(args.logs, run.runId);
    if (!linked.length) continue;

    const snap = run.intervalIntensitySnapshot;
    const session = pickFlaggedPlanSession(linked, args.planSessions, snap);
    if (!session) continue;

    const log = linked.find((l) => l.sessionId === session.id)?.log;
    if (!log) continue;

    try {
      const inputs = buildAnalyzeInputs({
        session,
        health: run,
        log,
        maxHeartRateBpm: args.maxHeartRateBpm,
      });
      if (!inputs) {
        unchanged++;
        await yieldToMain();
        continue;
      }

      const planDesc = intervalPlanDescription(
        (session as { desc?: string | null }).desc ?? null,
        session.pace ?? null,
      );
      const ext = extractIntervalSegments(
        inputs.intervalContext.laps,
        inputs.intervalContext.gpsStream,
        inputs.intervalContext.splits,
        planDesc,
      );

      if (ext === null) {
        if (snap?.scoringVersion === "interval_v2_no_segments") {
          unchanged++;
          await yieldToMain();
          continue;
        }
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.warn(
            `Backfill skipped for ${run.runId} — no segment data available for re-extraction`,
          );
        }
        const marker: IntervalIntensitySnapshot = {
          scoringVersion: "interval_v2_no_segments",
          updatedAt: getAppNow().toISOString(),
          intervalEvaluationNote: "Bewertung basiert auf Gesamtpace — keine Segment-Daten verfügbar",
          ...(typeof snap?.intensityScore === "number"
            ? { intensityScore: snap.intensityScore, coachMessage: snap.coachMessage }
            : {}),
        };
        next[idx] = { ...run, intervalIntensitySnapshot: marker };
        mutated = true;
        skippedNoSegments++;
        await yieldToMain();
        continue;
      }

      const analysis = analyzeWorkout({
        workout: inputs.workout,
        history: [],
        recovery: null,
        intervalContext: inputs.intervalContext,
      });

      const l2 = analysis.level2;
      if (!l2 || l2.model !== "interval") {
        unchanged++;
        await yieldToMain();
        continue;
      }

      const prevScore = snap?.intensityScore;
      const coachMsg = analysis.coach?.message ?? "";

      const snapshot: IntervalIntensitySnapshot = {
        intensityScore: l2.intensityScore,
        coachMessage: coachMsg,
        scoringVersion: "interval_v2",
        updatedAt: getAppNow().toISOString(),
        verdictVersion: "interval_v2",
        avgIntervalPaceSecPerKm:
          typeof l2.intervalMeta?.avgIntervalPace === "number" && l2.intervalMeta.avgIntervalPace > 0
            ? l2.intervalMeta.avgIntervalPace
            : undefined,
        targetPaceSecPerKm:
          typeof l2.intervalMeta?.targetPace === "number" && Number.isFinite(l2.intervalMeta!.targetPace!)
            ? l2.intervalMeta!.targetPace!
            : null,
      };

      next[idx] = { ...run, intervalIntensitySnapshot: snapshot };
      mutated = true;

      const prevEv =
        typeof log.runEvaluation === "object" && log.runEvaluation !== null ? log.runEvaluation : {};
      mutatedSessionLogs[session.id] = {
        ...log,
        runEvaluation: {
          ...(prevEv as object),
          status:
            typeof (prevEv as { status?: string }).status === "string" && (prevEv as { status?: string }).status!.length > 0
              ? (prevEv as { status?: string }).status!
              : "ideal",
          label: `Intervall-Bewertung ${l2.intensityScore}/100`,
          feedback: coachMsg,
          updatedAt: getAppNow().toISOString(),
        },
      };

      if (typeof prevScore === "number" && prevScore === l2.intensityScore) {
        unchanged++;
      } else {
        rescored++;
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.warn("[backfillIntervalWorkoutScores] row failed", run.runId, e);
      }
      unchanged++;
    }

    await yieldToMain();
  }

  return {
    healthRuns: mutated ? next : args.healthRuns,
    rescored,
    skippedNoSegments,
    unchanged,
    mutated,
    mutatedSessionLogs: Object.keys(mutatedSessionLogs).length ? mutatedSessionLogs : undefined,
  };
}
