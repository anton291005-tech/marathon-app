// @ts-nocheck — Plugin-Typen (HealthDataType) decken Plugin-Strings nicht vollständig ab.
/**
 * iOS Apple Health / HealthKit — eine zentrale Schicht über @capgo/capacitor-health.
 * Keine UI, kein React-State: nur Verfügbarkeit, Berechtigung, Roh-Query → StoredHealthRun[].
 */

import { getAppNow } from "../core/time/timeSystem";
import type { StoredHealthRun } from "../healthRuns";
import {
  averageHeartRateBpmInWorkoutWindow,
  getStoredHealthRunCanonicalType,
  workoutToStored,
  type HeartRateSamplePoint,
} from "../healthRuns";
import { aggregateRecoverySamples, type MinimalHealthSample } from "../recovery/aggregateRecoverySamples";
import { finalizeRecoveryDailyRows } from "../recovery/finalizeRecoveryDailyRows";
import type { RecoveryDailyRow } from "../recovery/recoveryTypes";
import { loadHealthAnchors, saveHealthAnchors } from "./healthAnchorStore";
import { appleHealthMissingCyclingDistance } from "./appleHealthPermissions";
import { classifyWorkoutType } from "./workoutTypeClassifier";

export const APPLE_HEALTH_READ_TYPES = [
  "workouts",
  "distance",
  "distanceCycling",
  "heartRate",
  "calories",
  "activeEnergyBurned",
  "sleep",
  "heartRateVariability",
  "restingHeartRate",
  "respiratoryRate",
  "bodyTemperature",
  "basalBodyTemperature",
] as const;

/** Lokale Mitternacht (Gerätekalender), analog zu Calendar.current.startOfDay. */
export function localCalendarStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Workout-Zeitfenster: [startOfDay(heute) − daysBackMidnight Kalendertage, jetzt + kleiner Puffer].
 * Entspricht der bisherigen Semantik: daysBackMidnight = 7 → Start = heute 00:00 minus 7 Tage.
 */
export function appleHealthWorkoutQueryRangeFromMidnightDaysBack(daysBackMidnight: number, now = getAppNow()) {
  const endNow = new Date(now);
  const start = localCalendarStartOfDay(endNow);
  start.setDate(start.getDate() - daysBackMidnight);
  const endForNative = new Date(endNow.getTime() + 2000);
  return {
    startIso: start.toISOString(),
    endIsoLogical: endNow.toISOString(),
    endIsoForQuery: endForNative.toISOString(),
  };
}

/** Inklusive Kalendertage ab lokaler Mitternacht: 3 ⇒ heute, gestern, vorgestern. */
export function appleHealthWorkoutQueryRangeLastNCalendarDaysInclusive(inclusiveDays: number, now = getAppNow()) {
  const n = Math.max(1, Math.floor(inclusiveDays));
  const endNow = new Date(now);
  const start = localCalendarStartOfDay(endNow);
  start.setDate(start.getDate() - (n - 1));
  const endForNative = new Date(endNow.getTime() + 2000);
  return {
    startIso: start.toISOString(),
    endIsoLogical: endNow.toISOString(),
    endIsoForQuery: endForNative.toISOString(),
  };
}

/** @deprecated Name — nutzt `appleHealthWorkoutQueryRangeFromMidnightDaysBack(7)`. */
export function appleHealthWorkoutQueryRange7DaysLocal(now = getAppNow()) {
  return appleHealthWorkoutQueryRangeFromMidnightDaysBack(7, now);
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
  const result = await Health.requestAuthorization({ read: [...APPLE_HEALTH_READ_TYPES] });
  console.log("[appleHealthService] requestAuthorization", result);
  try {
    const check = await Health.checkAuthorization({ read: [...APPLE_HEALTH_READ_TYPES] });
    console.log("[appleHealthService] checkAuthorization readAuthorized", check?.readAuthorized, "readDenied", check?.readDenied);
  } catch (e) {
    console.warn("[appleHealthService] checkAuthorization after request failed", e);
  }
}

export type HealthKitWorkoutFetchStats = {
  /** Roh-Anzahl nach Key-Dedupe im Abfragefenster */
  fetchedTotal: number;
  /** In `incomingStoredRuns` (Lauf/Rad) */
  syncedTotal: number;
  runningCount: number;
  cyclingCount: number;
  /** Nicht importiert (andere Sportarten) */
  ignoredCount: number;
  /** Übernommene Zeilen ohne Distanz aus HealthKit */
  unknownDistanceCount: number;
  filteredTypesSample: string[];
};

export type HealthKitWorkoutFetchResult = {
  stats: HealthKitWorkoutFetchStats;
  incomingStoredRuns: StoredHealthRun[];
  /** Workouts ok, aber Cycling-Distanz-Typ nicht freigegeben */
  missingCyclingDistance?: boolean;
};

/** @deprecated — nutze HealthKitWorkoutFetchResult */
export type HealthKitRunningFetchResult = HealthKitWorkoutFetchResult;

type RawWorkout = {
  startDate: string;
  endDate?: string;
  duration: number;
  totalDistance?: number;
  /** @capgo/capacitor-health iOS uses this; some bridges use `workoutActivityType` */
  workoutType?: string;
  workoutActivityType?: string;
  sourceName?: string;
  platformId?: string;
};

function hkWorkoutTypeRaw(w: RawWorkout): string {
  const t = w.workoutType ?? w.workoutActivityType;
  return t != null && String(t).trim() !== "" ? String(t) : "";
}

function normalizeRawWorkoutForStorage(w: RawWorkout, typeStr: string): RawWorkout {
  const merged = typeStr || hkWorkoutTypeRaw(w);
  return { ...w, workoutType: merged || w.workoutType, workoutActivityType: w.workoutActivityType };
}

function dedupeWorkouts(all: RawWorkout[]): RawWorkout[] {
  const dedupeKeys = new Set<string>();
  const deduped: RawWorkout[] = [];
  for (const w of all) {
    const typeKey = hkWorkoutTypeRaw(w) || String(w.workoutType ?? w.workoutActivityType ?? "");
    const k = `${w.startDate}|${w.duration}|${typeKey}|${w.totalDistance ?? ""}|${w.platformId ?? ""}`;
    if (dedupeKeys.has(k)) continue;
    dedupeKeys.add(k);
    deduped.push(w);
  }
  return deduped;
}

function rawWorkoutSynced(w: RawWorkout): boolean {
  const c = classifyWorkoutType(hkWorkoutTypeRaw(w));
  return c === "run" || c === "bike";
}

type QueryPagesOpts = {
  ignorePersistedWorkoutAnchor: boolean;
};

async function queryWorkoutsAllPages(
  Health: typeof import("@capgo/capacitor-health").Health,
  startIso: string,
  endIsoForQuery: string,
  logTag: string,
  opts: QueryPagesOpts,
): Promise<{
  workouts: RawWorkout[];
  pages: number;
  anchorsReturned: string[];
  anchorUsedOnFirstPage: boolean;
  persistedAnchorAfterSync?: string;
}> {
  const perPageLimit = 400;
  const maxPages = 20;

  if (opts.ignorePersistedWorkoutAnchor) {
    saveHealthAnchors({ ...loadHealthAnchors(), workoutsAnchor: undefined });
  }

  const anchorState = loadHealthAnchors();
  let resumeAnchor: string | undefined = opts.ignorePersistedWorkoutAnchor ? undefined : anchorState.workoutsAnchor;
  const anchorUsedOnFirstPage = Boolean(resumeAnchor);

  async function pullAll(firstPageAnchor: string | undefined): Promise<{
    workouts: RawWorkout[];
    pages: number;
    anchorsReturned: string[];
    lastAnchorForResume?: string;
  }> {
    const all: RawWorkout[] = [];
    const anchorsReturned: string[] = [];
    let chainAnchor: string | undefined = undefined;
    let lastAnchorForResume: string | undefined = undefined;
    let pages = 0;

    for (let page = 0; page < maxPages; page++) {
      pages = page + 1;
      const anchorIn = page === 0 ? firstPageAnchor : chainAnchor;
      console.log(
        `[appleHealthService] ${logTag} queryWorkouts page=${page} anchorIn=${anchorIn ?? "(none)"} start=${startIso} end=${endIsoForQuery}`,
      );
      const res = await Health.queryWorkouts({
        startDate: startIso,
        endDate: endIsoForQuery,
        limit: perPageLimit,
        ascending: false,
        ...(anchorIn ? { anchor: anchorIn } : {}),
      });
      const batch = Array.isArray(res.workouts) ? res.workouts : [];
      if (page === 0 && batch.length > 0 && (typeof process === "undefined" || process.env?.NODE_ENV !== "test")) {
        const workouts = batch;
        console.log("[HK RAW WORKOUT TYPES]", workouts.map((w) => w.workoutActivityType ?? w.workoutType));
        console.log(
          "[HK RAW SAMPLE CYCLING]",
          workouts
            .filter((w) => String(w.workoutActivityType ?? w.workoutType ?? "").toLowerCase().includes("cycl"))
            .slice(0, 5),
        );
      }
      all.push(...batch);
      const nextA = res.anchor;
      console.log(
        `[appleHealthService] ${logTag} page=${page} batch=${batch.length} cumulative=${all.length} anchorOut=${nextA ?? "(none)"}`,
      );
      if (nextA) anchorsReturned.push(String(nextA));

      if (batch.length === 0) {
        lastAnchorForResume = undefined;
        break;
      }
      if (!nextA) {
        lastAnchorForResume = undefined;
        break;
      }
      if (page === maxPages - 1) {
        lastAnchorForResume = nextA;
        break;
      }
      chainAnchor = nextA;
    }

    return { workouts: all, pages, anchorsReturned, lastAnchorForResume };
  }

  let { workouts, pages, anchorsReturned, lastAnchorForResume } = await pullAll(resumeAnchor);

  if (!opts.ignorePersistedWorkoutAnchor && resumeAnchor && workouts.length === 0) {
    console.warn(`[appleHealthService] ${logTag} empty fetch with stored workoutsAnchor — retrying without anchor`);
    ({ workouts, pages, anchorsReturned, lastAnchorForResume } = await pullAll(undefined));
  }

  const persistedAnchorAfterSync = lastAnchorForResume;
  saveHealthAnchors({
    workoutsAnchor: persistedAnchorAfterSync,
    lastSyncAt: getAppNow().toISOString(),
  });

  return { workouts, pages, anchorsReturned, anchorUsedOnFirstPage, persistedAnchorAfterSync };
}

function summarizeTypes(workouts: RawWorkout[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const w of workouts) {
    const t = hkWorkoutTypeRaw(w) || "unknown";
    m[t] = (m[t] ?? 0) + 1;
  }
  return m;
}

export type HealthKitWorkoutFetchOptions = {
  daysBackFromTodayMidnight?: number;
  inclusiveCalendarDays?: number;
  logTag?: string;
  /** Kein persistierter Anchor auf Seite 0; gespeicherter Anchor wird vorher gelöscht. */
  ignorePersistedWorkoutAnchor?: boolean;
};

/**
 * Liest Workouts im Zeitfenster, übernimmt Lauf + Rad in StoredHealthRun (inkl. optionaler HF im Fenster).
 */
export async function healthKitFetchWorkoutsForAppStorage(
  options: HealthKitWorkoutFetchOptions = {},
): Promise<HealthKitWorkoutFetchResult> {
  const logTag = options.logTag ?? "workouts";
  const ignorePersistedWorkoutAnchor = options.ignorePersistedWorkoutAnchor === true;

  const empty = (): HealthKitWorkoutFetchResult => ({
    stats: {
      fetchedTotal: 0,
      syncedTotal: 0,
      runningCount: 0,
      cyclingCount: 0,
      ignoredCount: 0,
      unknownDistanceCount: 0,
      filteredTypesSample: [],
    },
    incomingStoredRuns: [],
    missingCyclingDistance: false,
  });

  try {
    const { Health } = await import("@capgo/capacitor-health");
    const available = await Health.isAvailable();
    if (!available?.available) return empty();

    try {
      const perm = await Health.checkAuthorization({ read: [...APPLE_HEALTH_READ_TYPES] });
      if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
        console.log("[PERMISSIONS]", { readAuthorized: perm?.readAuthorized, readDenied: perm?.readDenied });
      }
    } catch (e) {
      console.warn("[appleHealthService] [PERMISSIONS] check failed", e);
    }

    const range =
      options.inclusiveCalendarDays != null
        ? appleHealthWorkoutQueryRangeLastNCalendarDaysInclusive(options.inclusiveCalendarDays)
        : appleHealthWorkoutQueryRangeFromMidnightDaysBack(options.daysBackFromTodayMidnight ?? 7);
    const { startIso, endIsoForQuery } = range;

    const { workouts: rawList, pages, anchorsReturned, anchorUsedOnFirstPage, persistedAnchorAfterSync } =
      await queryWorkoutsAllPages(Health, startIso, endIsoForQuery, logTag, { ignorePersistedWorkoutAnchor });

    console.log(
      `[appleHealthService] ${logTag} pagination pages=${pages} anchorsReturnedCount=${anchorsReturned.length} persistedAnchorAfterSync=${persistedAnchorAfterSync ?? "(none)"}`,
    );

    const deduped = dedupeWorkouts(rawList);
    const typeHistogram = summarizeTypes(deduped);
    console.log(`[appleHealthService] ${logTag} deduped=${deduped.length} types`, typeHistogram);

    const runningCount = deduped.filter(
      (w) => hkWorkoutTypeRaw(w) && classifyWorkoutType(hkWorkoutTypeRaw(w)) === "run",
    ).length;
    const cyclingCount = deduped.filter(
      (w) => hkWorkoutTypeRaw(w) && classifyWorkoutType(hkWorkoutTypeRaw(w)) === "bike",
    ).length;

    const filteredOutList = deduped.filter((w) => !rawWorkoutSynced(w));
    const outMap = new Map<string, number>();
    for (const w of filteredOutList) {
      const t = hkWorkoutTypeRaw(w) || "unknown";
      outMap.set(t, (outMap.get(t) ?? 0) + 1);
    }
    const filteredTypesSample = [...outMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k}:${v}`);

    if (filteredOutList.length > 0) {
      console.log(
        `[appleHealthService] ${logTag} ignored=${filteredOutList.length} sampleTypes`,
        filteredTypesSample,
      );
    }

    const sortedDeduped = [...deduped].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
    const selected: RawWorkout[] = [];
    let filteredOutOther = 0;
    for (const w of sortedDeduped) {
      const typeStr = hkWorkoutTypeRaw(w);
      const canonical = classifyWorkoutType(typeStr);
      if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
        console.log("[CLASSIFIED WORKOUT]", {
          original: typeStr || w.workoutType || w.workoutActivityType,
          canonical,
        });
      }
      if (canonical === "other") {
        filteredOutOther++;
        continue;
      }
      selected.push(normalizeRawWorkoutForStorage(w, typeStr));
    }
    if (filteredOutOther > 0) {
      console.log(`[appleHealthService] ${logTag} dropped canonical=other count=${filteredOutOther}`);
    }

    for (const w of selected.slice(0, 8)) {
      const endIso =
        w.endDate ||
        new Date(new Date(w.startDate).getTime() + (Number(w.duration) || 0) * 1000).toISOString();
      console.log(
        `[appleHealthService] ${logTag} sync candidate type=${hkWorkoutTypeRaw(w) || w.workoutType} start=${w.startDate} end=${endIso} distM=${w.totalDistance ?? "none"}`,
      );
    }

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

    const incomingStoredRuns = selected.map((w) => {
      const hkRaw = w.workoutActivityType ?? w.workoutType;
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[HK RAW TYPE]", hkRaw);
      }
      const typeStr = hkWorkoutTypeRaw(w);
      if (
        process.env.NODE_ENV === "development" &&
        typeStr &&
        (typeStr.toLowerCase().includes("cycl") ||
          typeStr.toLowerCase().includes("bike") ||
          typeStr.toLowerCase().includes("biking")) &&
        classifyWorkoutType(typeStr) !== "bike"
      ) {
        throw new Error("❌ CYCLING MISCLASSIFIED AS NON-BIKE");
      }
      const endIso =
        w.endDate ||
        new Date(new Date(w.startDate).getTime() + (Number(w.duration) || 0) * 1000).toISOString();
      const stored = workoutToStored(
        w,
        averageHeartRateBpmInWorkoutWindow(w.startDate, endIso, hrPoints),
      );
      if (
        process.env.NODE_ENV === "development" &&
        stored.workoutType &&
        (stored.workoutType.toLowerCase().includes("cycl") ||
          stored.workoutType.toLowerCase().includes("bike")) &&
        getStoredHealthRunCanonicalType(stored) !== "bike"
      ) {
        throw new Error("❌ FINAL CANONICAL MISMATCH");
      }
      return stored;
    });

    const unknownDistanceCount = incomingStoredRuns.filter((r) => r.distanceUnknown).length;

    const stats: HealthKitWorkoutFetchStats = {
      fetchedTotal: deduped.length,
      syncedTotal: incomingStoredRuns.length,
      runningCount,
      cyclingCount,
      ignoredCount: filteredOutList.length,
      unknownDistanceCount,
      filteredTypesSample,
    };

    let missingCyclingDistance = false;
    try {
      const check = await Health.checkAuthorization({ read: [...APPLE_HEALTH_READ_TYPES] });
      const auth = check?.readAuthorized;
      missingCyclingDistance = appleHealthMissingCyclingDistance(Array.isArray(auth) ? auth : undefined);
    } catch (e) {
      console.warn("[appleHealthService] checkAuthorization in fetch failed", e);
    }

    console.log("[Health Sync Summary]", {
      fetchedTotal: stats.fetchedTotal,
      syncedTotal: stats.syncedTotal,
      runningCount: stats.runningCount,
      cyclingCount: stats.cyclingCount,
      ignoredCount: stats.ignoredCount,
      unknownDistanceCount: stats.unknownDistanceCount,
      anchorUsed: anchorUsedOnFirstPage,
      anchorPersisted: Boolean(persistedAnchorAfterSync),
      missingCyclingDistance,
    });
    console.log(`[appleHealthService] ${logTag} stats`, stats);

    return { stats, incomingStoredRuns, missingCyclingDistance };
  } catch (e) {
    console.error("[appleHealthService] healthKitFetchWorkoutsForAppStorage failed", e);
    return empty();
  }
}

/**
 * Standard: letzte 7 Tage ab Mitternacht (bisheriges Verhalten des Fensters), inkl. Lauf + Rad.
 */
export async function healthKitFetchRunningWorkoutsLast7Days(): Promise<HealthKitWorkoutFetchResult> {
  return healthKitFetchWorkoutsForAppStorage({ daysBackFromTodayMidnight: 7, logTag: "last7d" });
}

/**
 * Manuelles „Voll reload“: letzte 3 Kalendertage; persistierter Workout-Anchor wird verworfen.
 */
export async function healthKitForceRefreshWorkoutsLast3Days(): Promise<HealthKitWorkoutFetchResult> {
  return healthKitFetchWorkoutsForAppStorage({
    inclusiveCalendarDays: 3,
    logTag: "force3d",
    ignorePersistedWorkoutAnchor: true,
  });
}

/**
 * Schlaf + nächtliche Vitaldaten (HRV, Ruhepuls, Atemfrequenz, optional Hauttemp.) — letzte 120 Tage, zu Tageszeilen aggregiert.
 */
export async function healthKitFetchRecoveryDailyLast120Days(now: Date = getAppNow()): Promise<RecoveryDailyRow[]> {
  try {
    const { Health } = await import("@capgo/capacitor-health");
    const available = await Health.isAvailable();
    if (!available?.available) return [];

    const endForNative = new Date(now.getTime() + 2000);
    const startLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startLocalMidnight.setDate(startLocalMidnight.getDate() - 120);
    startLocalMidnight.setHours(0, 0, 0, 0);
    const startIso = startLocalMidnight.toISOString();
    const endIso = endForNative.toISOString();

    const types = [
      "sleep",
      "activeEnergyBurned",
      "heartRateVariability",
      "restingHeartRate",
      "respiratoryRate",
      "bodyTemperature",
      "basalBodyTemperature",
    ] as const;

    const all: MinimalHealthSample[] = [];
    for (const dataType of types) {
      try {
        const res = await Health.readSamples({
          dataType,
          startDate: startIso,
          endDate: endIso,
          limit: 28000,
          ascending: true,
        });
        for (const s of res.samples || []) {
          all.push({
            dataType: s.dataType,
            value: s.value,
            unit: s.unit,
            startDate: s.startDate,
            endDate: s.endDate,
            ...(s.sleepState ? { sleepState: s.sleepState } : {}),
          });
        }
      } catch (e) {
        console.warn("[appleHealthService] readSamples failed for", dataType, e);
      }
    }

    const raw = aggregateRecoverySamples(all, now);
    return finalizeRecoveryDailyRows(raw);
  } catch (e) {
    console.error("[appleHealthService] healthKitFetchRecoveryDailyLast120Days failed", e);
    return [];
  }
}
