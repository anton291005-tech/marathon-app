// @ts-nocheck
/**
 * Dedupe + merge Apple Health / Health Connect Laufdaten (Capacitor).
 * Single Source für localStorage key "healthRuns".
 */

import {
  classifyWorkoutType,
  isSyncedCanonicalType,
  type CanonicalWorkoutType,
} from "./appleHealth/workoutTypeClassifier";

export const HEALTH_RUNS_STORAGE_KEY = "healthRuns";

/**
 * Step 5 (cycling sync debug): set `true` locally to see if dedupe drops bike rows.
 * Must stay `false` in committed code so merge/dedup tests stay valid.
 */
let mergeHealthRunsDedupBypass = false;

/** @internal test hook */
export function __setMergeHealthRunsDedupBypassForTests(v: boolean): void {
  mergeHealthRunsDedupBypass = v;
}

/** Step 5: call with `true` in a device debug session to test if merge dedup drops cycling (`mergeHealthRuns`). */
export function setMergeHealthRunsDedupBypassForDebug(v: boolean): void {
  mergeHealthRunsDedupBypass = v;
}

function canonicalFromStored(r: StoredHealthRun): CanonicalWorkoutType {
  const t = r.workoutType;
  return classifyWorkoutType(t == null ? "" : String(t));
}

/** Persisted interval scoring snapshot (local + Supabase `interval_snapshot`). */
/** Normalized or raw HealthKit lap rows (tests accept multiple wire shapes). */
export type HealthRunLap = {
  distanceMeters?: number;
  durationSeconds?: number;
  distance?: number;
  duration?: number;
  type?: number | string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type IntervalIntensitySnapshot = {
  intensityScore?: number;
  coachMessage?: string;
  scoringVersion?: string;
  updatedAt?: string;
  verdictVersion?: string;
  intervalEvaluationNote?: string;
  avgIntervalPaceSecPerKm?: number;
  targetPaceSecPerKm?: number | null;
};

export type StoredHealthRun = {
  runId: string;
  startDate: string;
  duration: number;
  /** Meter aus HealthKit; `null` wenn keine Distanz geliefert wurde (kein synthetisches 0). */
  distanceMeters: number | null;
  /** true wenn HealthKit keine `totalDistance` geliefert hat */
  distanceUnknown: boolean;
  workoutType?: string;
  sourceName?: string;
  /** HealthKit-Workout-UUID (iOS), falls vom Plugin geliefert — stabile Identität */
  platformId?: string;
  /** Durchschnittliche HF im Workout-Zeitfenster (Apple Health), falls ermittelbar */
  avgHeartRateBpm?: number;
  splits?: unknown;
  laps?: HealthRunLap[];
  gpsStream?: unknown;
  intervalIntensitySnapshot?: IntervalIntensitySnapshot;
};

/** Kanonischer Typ für Anzeige / Aggregat (fehlender `workoutType` → `other`, kein stiller Lauf-Fallback). */
export function getStoredHealthRunCanonicalType(r: StoredHealthRun): CanonicalWorkoutType {
  return canonicalFromStored(r);
}

/** Nur Lauf-Workouts in Run-KM / Plan-Logik (kein Rad). */
export function storedHealthRunIsRunning(r: StoredHealthRun): boolean {
  return canonicalFromStored(r) === "run";
}

/** Lauf + Rad: wird aus HealthKit geladen und in der Health-Liste angezeigt. */
export function storedHealthRunIsSyncedActivity(r: StoredHealthRun): boolean {
  return isSyncedCanonicalType(canonicalFromStored(r));
}

/** Bekannte Distanz in km, sonst `undefined` (für Aggregationen ohne „fake 0“). */
export function storedHealthRunDistanceKmNumeric(r: StoredHealthRun): number | undefined {
  if (r.distanceUnknown) return undefined;
  const m = r.distanceMeters;
  if (m == null || !Number.isFinite(m) || m <= 0) return undefined;
  return m / 1000;
}

export function makeHealthRunId(startDate: string, duration: number, distanceMeters: number | null): string {
  const dist = distanceMeters == null ? "u" : String(distanceMeters);
  return `${startDate}_${duration}_${dist}`;
}

/** Bevorzugt HealthKit-UUID; sonst stabiler Fallback aus Start/Distanz/Dauer. */
export function healthRunStableId(
  startDate: string,
  duration: number,
  distanceMeters: number | null,
  platformId?: string,
): string {
  const p = platformId && String(platformId).trim();
  if (p) return `hk_${p}`;
  return makeHealthRunId(startDate, duration, distanceMeters);
}

/** HF-Samples (z. B. aus Health.readSamples), Wert in bpm */
export type HeartRateSamplePoint = { startDate: string; value: number };

/** Mittlere HF über Samples, deren Zeitpunkt innerhalb [workoutStart, workoutEnd] liegt */
export function averageHeartRateBpmInWorkoutWindow(
  workoutStartIso: string,
  workoutEndIso: string,
  samples: HeartRateSamplePoint[],
): number | undefined {
  const wStart = new Date(workoutStartIso).getTime();
  const wEnd = new Date(workoutEndIso).getTime();
  if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return undefined;
  const inRange = samples.filter((s) => {
    const t = new Date(s.startDate).getTime();
    return Number.isFinite(t) && t >= wStart && t <= wEnd;
  });
  if (inRange.length === 0) return undefined;
  return inRange.reduce((a, s) => a + s.value, 0) / inRange.length;
}

/** Aus Capacitor-Workout → gespeicherte Form inkl. runId */
export function workoutToStored(
  workout: {
    startDate: string;
    duration: number;
    totalDistance?: number;
    workoutType?: string;
    /** iOS / Capgo: oft nur hier gesetzt — muss in `workoutType` landen. */
    workoutActivityType?: string;
    sourceName?: string;
    platformId?: string;
    laps?: unknown;
    splits?: unknown;
    gpsStream?: unknown;
    workoutEvents?: unknown;
  } & Record<string, unknown>,
  avgHeartRateBpm?: number,
): StoredHealthRun {
  const hasDistance = typeof workout.totalDistance === "number" && Number.isFinite(workout.totalDistance);
  const distanceMeters = hasDistance ? workout.totalDistance : null;
  const distanceUnknown = !hasDistance;
  const platformId = workout.platformId && String(workout.platformId).trim();
  const runId = healthRunStableId(workout.startDate, workout.duration, distanceMeters, platformId);

  const act =
    workout.workoutActivityType != null && String(workout.workoutActivityType).trim() !== ""
      ? String(workout.workoutActivityType).trim()
      : "";
  const wtField =
    workout.workoutType != null && String(workout.workoutType).trim() !== ""
      ? String(workout.workoutType).trim()
      : "";
  const rawType = act || wtField;

  if (!rawType) {
    if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.error("❌ MISSING WORKOUT TYPE FROM HEALTHKIT", workout);
    }
  }

  const canonical = classifyWorkoutType(rawType);
  if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.log("[STORED WORKOUT]", {
      workoutActivityType: workout.workoutActivityType,
      workoutType: workout.workoutType,
      preservedType: rawType || undefined,
      canonical,
      distanceMeters: distanceMeters ?? null,
      distanceUnknown,
    });
  }

  if (process.env.NODE_ENV === "development") {
    const low = rawType.toLowerCase();
    if (
      (low.includes("cycl") || low.includes("bike") || low.includes("biking")) &&
      canonical !== "bike"
    ) {
      throw new Error("❌ FINAL CANONICAL MISMATCH");
    }
  }

  const stored: StoredHealthRun = {
    runId,
    startDate: workout.startDate,
    duration: workout.duration,
    distanceMeters,
    distanceUnknown,
    workoutType: rawType || undefined,
    sourceName: workout.sourceName,
    ...(platformId ? { platformId } : {}),
    ...(typeof avgHeartRateBpm === "number" && Number.isFinite(avgHeartRateBpm)
      ? { avgHeartRateBpm: Math.round(avgHeartRateBpm) }
      : {}),
    ...(workout.laps != null ? { laps: workout.laps as HealthRunLap[] } : {}),
    ...(workout.splits != null ? { splits: workout.splits } : {}),
    ...(workout.gpsStream != null ? { gpsStream: workout.gpsStream } : {}),
  };
  if (workout.workoutEvents != null) {
    (stored as StoredHealthRun & { workoutEvents?: unknown }).workoutEvents = workout.workoutEvents;
  }
  return stored;
}

function storedHealthRunMergeScore(r: StoredHealthRun): number {
  let s = 0;
  if (r.platformId && String(r.platformId).trim()) s += 4;
  if (!r.distanceUnknown && r.distanceMeters != null && r.distanceMeters > 0) s += 2;
  if (!r.distanceUnknown && r.distanceMeters != null && r.distanceMeters === 0) s += 0;
  if (typeof r.avgHeartRateBpm === "number" && Number.isFinite(r.avgHeartRateBpm)) s += 1;
  return s;
}

/** Gleiche Aktivität (fuzzy): Start ±1 min, Dauer ±2 s, gleiche kanonische Kategorie. */
export function isSameHealthRunWorkout(a: StoredHealthRun, b: StoredHealthRun): boolean {
  const startDiff = Math.abs(new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const durationDiff = Math.abs(Number(a.duration) - Number(b.duration));
  return (
    startDiff < 60000 &&
    durationDiff < 120 &&
    canonicalFromStored(a) === canonicalFromStored(b)
  );
}

function preferRicherStoredHealthRun(a: StoredHealthRun, b: StoredHealthRun): StoredHealthRun {
  const sa = storedHealthRunMergeScore(a);
  const sb = storedHealthRunMergeScore(b);
  const winner = sb > sa ? b : sb < sa ? a : a.runId <= b.runId ? a : b;
  const loser = winner === a ? b : a;
  if (
    (winner.avgHeartRateBpm == null || !Number.isFinite(winner.avgHeartRateBpm)) &&
    typeof loser.avgHeartRateBpm === "number" &&
    Number.isFinite(loser.avgHeartRateBpm)
  ) {
    return { ...winner, avgHeartRateBpm: loser.avgHeartRateBpm };
  }
  return winner;
}

/**
 * Bestehende Runs aus localStorage + neue Samples mergen.
 * Fuzzy-Dedupe (Zeit/Dauer/Typ); bei Treffer wird die „reichere“ Zeile behalten.
 */
export function mergeHealthRuns(existing: StoredHealthRun[], incoming: StoredHealthRun[]): StoredHealthRun[] {
  if (mergeHealthRunsDedupBypass) {
    const merged = [...existing, ...incoming]
      .filter(storedHealthRunIsSyncedActivity)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
      console.log(
        "[MERGED WORKOUT TYPES] (dedup bypass)",
        merged.map((w) => classifyWorkoutType(String(w.workoutType || ""))),
      );
    }
    return merged;
  }

  const list: StoredHealthRun[] = [...existing];
  for (const r of incoming) {
    if (!storedHealthRunIsSyncedActivity(r)) continue;
    const dupIdx = list.findIndex((e) => isSameHealthRunWorkout(e, r));
    if (dupIdx >= 0) {
      list[dupIdx] = preferRicherStoredHealthRun(list[dupIdx], r);
    } else {
      const idDup = list.findIndex((e) => e.runId === r.runId);
      if (idDup >= 0) {
        list[idDup] = preferRicherStoredHealthRun(list[idDup], r);
      } else {
        list.push(r);
      }
    }
  }
  const merged = list
    .filter(storedHealthRunIsSyncedActivity)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  if (incoming.length > 0 && (typeof process === "undefined" || process.env?.NODE_ENV !== "test")) {
    console.log(
      "[MERGED WORKOUT TYPES]",
      merged.map((w) => classifyWorkoutType(String(w.workoutType || ""))),
    );
  }
  return merged;
}

function migrateStoredHealthRunRow(r: StoredHealthRun): StoredHealthRun {
  let distanceMeters = r.distanceMeters;
  let distanceUnknown = r.distanceUnknown;

  if (distanceUnknown === undefined) {
    if (distanceMeters == null) {
      distanceUnknown = true;
      distanceMeters = null;
    } else if (typeof distanceMeters === "number" && distanceMeters === 0) {
      distanceUnknown = true;
      distanceMeters = null;
    } else {
      distanceUnknown = false;
    }
  }

  const platformId = r.platformId && String(r.platformId).trim();
  const runId =
    typeof r.runId === "string" && r.runId.trim()
      ? r.runId
      : healthRunStableId(r.startDate, r.duration, distanceUnknown ? null : distanceMeters, platformId);

  return {
    ...r,
    runId,
    distanceMeters,
    distanceUnknown: !!distanceUnknown,
  };
}

export function loadHealthRunsFromStorage(
  readItem: (key: string) => string | null,
  parseJson: (v: string, fb: unknown) => unknown,
): StoredHealthRun[] {
  const raw = readItem(HEALTH_RUNS_STORAGE_KEY);
  const parsed = parseJson(raw || "null", []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r) => r && typeof r.runId === "string")
    .map((r) => migrateStoredHealthRunRow(r as StoredHealthRun))
    .filter((r) => storedHealthRunIsSyncedActivity(r));
}
