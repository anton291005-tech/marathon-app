import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef } from "react";
import { beginAppFrame, getAppNowEpochMs } from "../../core/time/timeSystem";

/** Automatischer Sync höchstens alle 60 s — Resume-Stürme (Control Center, App-Switcher) lösen nicht jedes Mal aus. */
export const APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS = 60_000;

/**
 * Ein nativer HealthKit-Aufruf, der nie zurückkommt, darf den Auto-Sync nicht für die ganze
 * App-Laufzeit sperren: nach dieser Zeit gilt ein laufender Sync als hängend und wird übergangen.
 */
export const APPLE_HEALTH_AUTO_SYNC_STALE_LOCK_MS = 2 * 60_000;

export type AppleHealthAutoSyncReason = "cold-start" | "resume";
export type AppleHealthAutoSyncOutcome = "synced" | "throttled" | "in-flight" | "failed";

export type AppleHealthAutoSyncController = {
  /** Startet einen Lauf, sofern keiner läuft und die Drossel abgelaufen ist. Wirft nie. */
  trigger: (reason: AppleHealthAutoSyncReason) => Promise<AppleHealthAutoSyncOutcome>;
};

/**
 * Drossel + Schutz gegen parallele Läufe für den automatischen Apple-Health-Sync (ohne React, testbar).
 *
 * `refreshClock` läuft VOR jedem Versuch: die App-Uhr (`timeSystem`) wird nur beim Rendern
 * aktualisiert. Ein `appStateChange` kommt ohne Render — ohne Auffrischen endet das
 * HealthKit-Abfragefenster beim letzten Render vor dem Hintergrund, und ein danach aufgezeichnetes
 * Workout liegt außerhalb.
 */
export function createAppleHealthAutoSyncController(deps: {
  runSync: () => Promise<unknown>;
  refreshClock: () => void;
  nowEpochMs: () => number;
  throttleMs?: number;
  staleLockMs?: number;
}): AppleHealthAutoSyncController {
  const throttleMs = deps.throttleMs ?? APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS;
  const staleLockMs = deps.staleLockMs ?? APPLE_HEALTH_AUTO_SYNC_STALE_LOCK_MS;
  /** Kennung des laufenden Sync; `null` = frei. Ein übergangener (hängender) Lauf gibt die Sperre nicht mehr frei. */
  let inFlightRun: number | null = null;
  let runCounter = 0;
  let lastStartedAtMs: number | null = null;

  return {
    async trigger(reason) {
      deps.refreshClock();
      const now = deps.nowEpochMs();
      // Uhr zurückgestellt: Zeitstempel verwerfen, sonst hielte die Drossel bis zum alten Stand.
      if (lastStartedAtMs != null && now < lastStartedAtMs) lastStartedAtMs = null;
      if (inFlightRun != null) {
        if (lastStartedAtMs == null || now - lastStartedAtMs < staleLockMs) return "in-flight";
        console.warn(`[appleHealthAutoSync] previous sync still pending after ${staleLockMs} ms — starting a new one`);
      } else if (lastStartedAtMs != null && now - lastStartedAtMs < throttleMs) {
        return "throttled";
      }
      const runId = ++runCounter;
      inFlightRun = runId;
      lastStartedAtMs = now;
      try {
        await deps.runSync();
        return "synced";
      } catch (e) {
        console.warn(`[appleHealthAutoSync] ${reason} sync failed`, e);
        return "failed";
      } finally {
        if (inFlightRun === runId) inFlightRun = null;
      }
    },
  };
}

/**
 * Automatischer Apple-Health-Sync: Kaltstart (über `useIosHealthKitBootstrap`, das den zurückgegebenen
 * Controller aufruft) und jede Rückkehr in den Vordergrund (`appStateChange` → active).
 *
 * Der Controller ist ab dem ersten Render stabil; `runSync` wird pro Lauf frisch gelesen, damit kein
 * veralteter Closure synchronisiert. Der manuelle Button in den Einstellungen läuft bewusst NICHT
 * hierüber — er ist weder gedrosselt noch blockiert.
 */
export function useAppleHealthAutoSync(runSync: () => Promise<unknown>): AppleHealthAutoSyncController {
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  const controllerRef = useRef<AppleHealthAutoSyncController | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createAppleHealthAutoSyncController({
      runSync: () => runSyncRef.current(),
      refreshClock: beginAppFrame,
      nowEpochMs: getAppNowEpochMs,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      void controller.trigger("resume");
    });
    return () => {
      void listenerPromise
        .then((l) => l.remove())
        .catch((e) => console.warn("[appleHealthAutoSync] listener cleanup failed", e));
    };
  }, [controller]);

  return controller;
}
