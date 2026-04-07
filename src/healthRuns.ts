// @ts-nocheck
/**
 * Dedupe + merge Apple Health / Health Connect Laufdaten (Capacitor).
 * Single Source für localStorage key "healthRuns".
 */

export const HEALTH_RUNS_STORAGE_KEY = "healthRuns";

/** Normalisierte Lauf-Entität mit stabiler ID */
export type StoredHealthRun = {
  runId: string;
  startDate: string;
  duration: number;
  /** Rohwert aus Health (Meter), 0 wenn unbekannt */
  distanceMeters: number;
  workoutType?: string;
  sourceName?: string;
  /** Durchschnittliche HF im Workout-Zeitfenster (Apple Health), falls ermittelbar */
  avgHeartRateBpm?: number;
};

export function makeHealthRunId(startDate: string, duration: number, distanceMeters: number): string {
  return `${startDate}_${duration}_${distanceMeters}`;
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
    sourceName?: string;
  },
  avgHeartRateBpm?: number,
): StoredHealthRun {
  const distanceMeters = typeof workout.totalDistance === "number" ? workout.totalDistance : 0;
  const runId = makeHealthRunId(workout.startDate, workout.duration, distanceMeters);
  return {
    runId,
    startDate: workout.startDate,
    duration: workout.duration,
    distanceMeters,
    workoutType: workout.workoutType,
    sourceName: workout.sourceName,
    ...(typeof avgHeartRateBpm === "number" && Number.isFinite(avgHeartRateBpm)
      ? { avgHeartRateBpm: Math.round(avgHeartRateBpm) }
      : {}),
  };
}

/**
 * Bestehende Runs aus localStorage + neue Samples mergen.
 * runId existiert bereits → ignorieren (deterministisch, keine Duplikate).
 */
export function mergeHealthRuns(existing: StoredHealthRun[], incoming: StoredHealthRun[]): StoredHealthRun[] {
  const byId = new Map(existing.map((r) => [r.runId, r]));
  for (const r of incoming) {
    if (!byId.has(r.runId)) {
      byId.set(r.runId, r);
    }
  }
  return Array.from(byId.values()).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

export function loadHealthRunsFromStorage(readItem: (key: string) => string | null, parseJson: (v: string, fb: unknown) => unknown): StoredHealthRun[] {
  const raw = readItem(HEALTH_RUNS_STORAGE_KEY);
  const parsed = parseJson(raw || "null", []);
  return Array.isArray(parsed) ? parsed.filter((r) => r && typeof r.runId === "string") : [];
}
