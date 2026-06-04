import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { StoredHealthRun } from "../healthRuns";
import {
  appleHealthCheckHeartRateReadAccess,
  appleHealthFetchAvgHeartRateBpmForInterval,
  appleHealthRequestHeartRateReadAuthorization,
} from "../appleHealth/appleHealthService";
import { computePlanAdherenceScore } from "../utils/planAdherenceScore";
import { shouldUseIntervalScoring } from "../utils/workoutEvaluationGuards";
import type { PostWorkoutHrPresentation, PostWorkoutSummary } from "./usePostWorkoutSummary";
import { intervalPlanDescription, normalizePostWorkoutSummary } from "./usePostWorkoutSummary";

function openIosAppPrivacySettings(): void {
  if (Capacitor.getPlatform() !== "ios") return;
  try {
    window.location.assign("app-settings:");
  } catch {
    try {
      window.location.href = "app-settings:";
    } catch {
      /* empty */
    }
  }
}

function recomputeAdherenceWithHr(summary: PostWorkoutSummary, actualHrBpm: number | null) {
  const runAnalyzeBecauseInterval = shouldUseIntervalScoring({
    sessionType: summary.session.type,
    sessionTitle: summary.session.title,
    planDescription: intervalPlanDescription(summary.session.desc ?? null, summary.session.paceLabel ?? null),
  });
  const intervalIntensityScore =
    summary.intervalDisplay?.intensityScore ??
    (summary.ai?.level2?.model === "interval" && typeof summary.ai.level2.intensityScore === "number"
      ? summary.ai.level2.intensityScore
      : null);
  const intervalAvg =
    summary.intervalDisplay?.avgPaceSecPerKm ??
    (summary.ai?.level2?.model === "interval" && typeof summary.ai.level2.intervalMeta?.avgIntervalPace === "number"
      ? summary.ai.level2.intervalMeta.avgIntervalPace
      : null);

  return computePlanAdherenceScore({
    plannedPaceSecPerKm: summary.planned.paceSecPerKm,
    actualPaceSecPerKm: summary.actual.paceSecPerKm,
    plannedDistanceKm: summary.planned.distanceKm,
    actualDistanceKm:
      summary.actual.distanceKm != null ? Math.round(summary.actual.distanceKm * 100) / 100 : null,
    plannedHrBpm: summary.planned.hrBpm,
    actualHrBpm,
    useIntervalPaceMetric: runAnalyzeBecauseInterval && typeof intervalIntensityScore === "number",
    intervalIntensityScore0_100: typeof intervalIntensityScore === "number" ? intervalIntensityScore : null,
    intervalAvgPaceSecPerKm:
      typeof intervalAvg === "number" && Number.isFinite(intervalAvg) && intervalAvg > 0 ? intervalAvg : null,
  });
}

function positiveBpm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v);
}

function effectiveStoredHrBpm(
  base: PostWorkoutSummary,
  healthRuns: StoredHealthRun[],
  logs: Record<string, any> | undefined,
): number | null {
  const fromBase = positiveBpm(base.actual.hrBpm);
  if (fromBase != null) return fromBase;
  const health = healthRuns.find((r) => r.runId === base.workoutId);
  const fromHealth = positiveBpm(health?.avgHeartRateBpm);
  if (fromHealth != null) return fromHealth;
  const log = logs?.[base.session.id];
  return positiveBpm(log?.assignedRun?.avgHeartRateBpm);
}

/**
 * On-demand HR: iOS fetches + persists; web/test show "Keine Daten" when HR missing.
 * Persists to healthRuns + marathonLogs via `persistWorkoutHeartRate`.
 */
export function usePostWorkoutHrEnrichment(
  base: PostWorkoutSummary | null,
  isOpen: boolean,
  opts: {
    logs: Record<string, any>;
    healthRuns: StoredHealthRun[];
    persistWorkoutHeartRate: (p: { sessionId: string; runId: string; avgHeartRateBpm: number }) => void;
  },
): PostWorkoutSummary | null {
  const [merged, setMerged] = useState<PostWorkoutSummary | null>(null);

  const iosRuntime =
    Capacitor.getPlatform() === "ios" &&
    (typeof process === "undefined" || process.env.NODE_ENV !== "test");

  const eff = base ? effectiveStoredHrBpm(base, opts.healthRuns, opts.logs) : null;
  const stableKey = base ? `${base.workoutId}:${base.completedAtIso}:${eff ?? ""}` : "";

  const syncMerged = useMemo(() => {
    if (!isOpen || !base) return null;
    const bpm = effectiveStoredHrBpm(base, opts.healthRuns, opts.logs);
    const pres: PostWorkoutHrPresentation =
      bpm != null ? { kind: "bpm", value: bpm } : iosRuntime ? { kind: "loading" } : { kind: "no_data" };
    const next: PostWorkoutSummary = { ...base, hrPresentation: pres };
    if (bpm != null) {
      next.actual = { ...base.actual, hrBpm: bpm };
      next.adherence = recomputeAdherenceWithHr({ ...base, actual: { ...base.actual, hrBpm: bpm } }, bpm);
    }
    return next;
  }, [isOpen, base, iosRuntime, opts.healthRuns, opts.logs]);

  useEffect(() => {
    if (!isOpen || !base) {
      setMerged(null);
      return;
    }
    const bpm0 = effectiveStoredHrBpm(base, opts.healthRuns, opts.logs);
    if (bpm0 != null) {
      setMerged(null);
      return;
    }
    if (!iosRuntime) {
      setMerged({ ...base, hrPresentation: { kind: "no_data" } });
      return;
    }

    const health = opts.healthRuns.find((r) => r.runId === base.workoutId) ?? null;
    if (!health?.startDate) {
      setMerged({ ...base, hrPresentation: { kind: "no_data" } });
      return;
    }

    let cancelled = false;
    setMerged({ ...base, hrPresentation: { kind: "loading" } });

    (async () => {
      const durationSec = Number(health.duration) || 0;
      const startMs = new Date(health.startDate).getTime();
      if (!Number.isFinite(startMs) || durationSec <= 0) {
        if (!cancelled) setMerged({ ...base, hrPresentation: { kind: "no_data" } });
        return;
      }
      const startIso = health.startDate;
      const endIso = new Date(startMs + durationSec * 1000 + 1000).toISOString();

      let access = await appleHealthCheckHeartRateReadAccess();
      if (cancelled) return;
      if (access.unavailable) {
        setMerged({ ...base, hrPresentation: { kind: "no_data" } });
        return;
      }
      if (access.denied) {
        setMerged({
          ...base,
          hrPresentation: { kind: "open_settings", onPress: openIosAppPrivacySettings },
        });
        return;
      }
      if (!access.granted) {
        await appleHealthRequestHeartRateReadAuthorization();
        if (cancelled) return;
        access = await appleHealthCheckHeartRateReadAccess();
        if (cancelled) return;
        if (access.denied) {
          setMerged({
            ...base,
            hrPresentation: { kind: "open_settings", onPress: openIosAppPrivacySettings },
          });
          return;
        }
      }

      const avg = await appleHealthFetchAvgHeartRateBpmForInterval(startIso, endIso);
      if (cancelled) return;
      if (typeof avg === "number" && avg > 0) {
        opts.persistWorkoutHeartRate({
          sessionId: base.session.id,
          runId: base.workoutId,
          avgHeartRateBpm: avg,
        });
        const actual = { ...base.actual, hrBpm: avg };
        const patched: PostWorkoutSummary = {
          ...base,
          actual,
          adherence: recomputeAdherenceWithHr({ ...base, actual }, avg),
          hrPresentation: { kind: "bpm", value: avg },
        };
        setMerged(patched);
        return;
      }
      setMerged({ ...base, hrPresentation: { kind: "no_data" } });
    })();

    return () => {
      cancelled = true;
    };
    // intentional: persist is stable via parent useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stableKey, iosRuntime, opts.healthRuns, opts.logs]);

  if (!isOpen || !base) return null;
  const result = merged ?? syncMerged;
  return normalizePostWorkoutSummary(result);
}
