// @ts-nocheck — Plugin-Typen (HealthDataType) decken Plugin-Strings nicht vollständig ab.
/**
 * iOS Apple Health / HealthKit — eine zentrale Schicht über @capgo/capacitor-health.
 * Keine UI, kein React-State: nur Verfügbarkeit, Berechtigung, Roh-Query → StoredHealthRun[].
 */

import type { StoredHealthRun } from "../healthRuns";
import {
  averageHeartRateBpmInWorkoutWindow,
  workoutToStored,
  type HeartRateSamplePoint,
} from "../healthRuns";

export const APPLE_HEALTH_READ_TYPES = ["workouts", "distance", "heartRate", "calories"] as const;

/** Lokale Kalendertage: heute − 7 Tage 00:00 bis jetzt (+ kleiner Puffer fürs Plugin). */
export function appleHealthWorkoutQueryRange7DaysLocal(now = new Date()) {
  const endNow = new Date(now);
  const startLocalMidnight = new Date(endNow.getFullYear(), endNow.getMonth(), endNow.getDate());
  startLocalMidnight.setDate(startLocalMidnight.getDate() - 7);
  startLocalMidnight.setHours(0, 0, 0, 0);
  const endForNative = new Date(endNow.getTime() + 2000);
  return {
    startIso: startLocalMidnight.toISOString(),
    endIsoLogical: endNow.toISOString(),
    endIsoForQuery: endForNative.toISOString(),
  };
}

export async function healthKitIsAvailable(): Promise<boolean> {
  try {
    const { Health } = await import("@capgo/capacitor-health");
    const availability = await Health.isAvailable();
    return !!availability?.available;
  } catch (e) {
    console.warn("[appleHealthService] healthKitIsAvailable failed", e);
    return false;
  }
}

export async function healthKitRequestReadAuthorization(): Promise<void> {
  const { Health } = await import("@capgo/capacitor-health");
  await Health.requestAuthorization({ read: [...APPLE_HEALTH_READ_TYPES] });
}

export type HealthKitRunningFetchResult = {
  stats: { total: number; running: number };
  incomingStoredRuns: StoredHealthRun[];
};

/**
 * Liest nur Lauf-Workouts (running / runningTreadmill), inkl. optionaler HF im Workout-Fenster.
 * Liefert neue Einträge zum Mergen (dedupe übernimmt mergeHealthRuns im Aufrufer).
 */
export async function healthKitFetchRunningWorkoutsLast7Days(): Promise<HealthKitRunningFetchResult> {
  const empty = (): HealthKitRunningFetchResult => ({
    stats: { total: 0, running: 0 },
    incomingStoredRuns: [],
  });

  try {
    const { Health } = await import("@capgo/capacitor-health");
    const available = await Health.isAvailable();
    if (!available?.available) return empty();

  const { startIso, endIsoForQuery } = appleHealthWorkoutQueryRange7DaysLocal();

  const perPageLimit = 400;
  const maxPages = 20;
  const all: Array<{
    startDate: string;
    endDate?: string;
    duration: number;
    totalDistance?: number;
    workoutType?: string;
    sourceName?: string;
    platformId?: string;
  }> = [];
  let anchor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await Health.queryWorkouts({
      startDate: startIso,
      endDate: endIsoForQuery,
      limit: perPageLimit,
      ascending: false,
      ...(anchor ? { anchor } : {}),
    });
    const batch = Array.isArray(res.workouts) ? res.workouts : [];
    all.push(...batch);
    if (!res.anchor || batch.length === 0) break;
    anchor = res.anchor;
  }

  const dedupeKeys = new Set<string>();
  const deduped: typeof all = [];
  for (const w of all) {
    const k = `${w.startDate}|${w.duration}|${w.workoutType}|${w.totalDistance ?? ""}|${w.platformId ?? ""}`;
    if (dedupeKeys.has(k)) continue;
    dedupeKeys.add(k);
    deduped.push(w);
  }

  const running = deduped
    .filter((w) => w.workoutType === "running" || w.workoutType === "runningTreadmill")
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  let hrPoints: HeartRateSamplePoint[] = [];
  try {
    const hr = await Health.readSamples({
      dataType: "heartRate",
      startDate: startIso,
      endDate: endIsoForQuery,
      limit: 8000,
      ascending: true,
    });
    hrPoints = (hr.samples || []).map((s) => ({ startDate: s.startDate, value: s.value }));
  } catch {
    hrPoints = [];
  }

  const incomingStoredRuns = running.map((w) => {
    const endIso =
      w.endDate ||
      new Date(new Date(w.startDate).getTime() + (Number(w.duration) || 0) * 1000).toISOString();
    return workoutToStored(w, averageHeartRateBpmInWorkoutWindow(w.startDate, endIso, hrPoints));
  });

  return {
    stats: { total: deduped.length, running: running.length },
    incomingStoredRuns,
  };
  } catch (e) {
    console.error("[appleHealthService] healthKitFetchRunningWorkoutsLast7Days failed", e);
    return empty();
  }
}
