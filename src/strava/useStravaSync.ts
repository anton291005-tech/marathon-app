import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { beginAppFrame, getAppNowEpochMs } from "../core/time/timeSystem";
import type { StoredHealthRun } from "../healthRuns";
import { getApiAuthHeaders } from "../lib/api/authHeaders";
import { getApiBaseUrl } from "../lib/api/apiBaseUrl";
import { loadStravaHealthWorkouts } from "../lib/supabase/services/healthWorkoutsService";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../persistence/safeLocalStorage";
import {
  createStravaSyncController,
  requestStravaSync,
  STRAVA_SYNC_STATE_KEY,
  type StravaSyncController,
  type StravaSyncPersistedState,
  type StravaSyncReason,
  type StravaSyncResult,
} from "./stravaSync";

export type UseStravaSyncDeps = {
  runSync?: () => Promise<StravaSyncResult>;
  loadStravaRuns?: (userId: string) => Promise<StoredHealthRun[] | null>;
  isNativePlatform?: () => boolean;
};

export type StravaSyncUiState = {
  busy: boolean;
  /** Letztes Ergebnis dieses App-Laufs (oder `null`). */
  lastResult: StravaSyncResult | null;
  /** Strava hat den Zugriff abgelehnt → „Strava neu verbinden“. Bleibt über Neustarts erhalten. */
  reconnectRequired: boolean;
  /** „Jetzt synchronisieren“: ohne Drossel. */
  syncNow: () => Promise<void>;
  /** Nach erfolgreichem Neu-Verbinden zurücksetzen. */
  clearReconnectRequired: () => void;
};

function readState(): StravaSyncPersistedState {
  const raw = safeReadLocalStorageJson<StravaSyncPersistedState | null>(STRAVA_SYNC_STATE_KEY, null);
  return raw && typeof raw === "object" ? raw : {};
}

function writeState(state: StravaSyncPersistedState): void {
  safeWriteLocalStorageJson(STRAVA_SYNC_STATE_KEY, state);
}

/**
 * Strava-Import im App-Lebenszyklus: beim Start (sobald Nutzer + Verbindung bekannt sind) und bei jeder
 * Rückkehr in den Vordergrund (iOS `appStateChange`, im Browser `visibilitychange`), gedrosselt auf
 * höchstens alle 15 min. Nach einem erfolgreichen Abgleich lädt der Hook die Strava-Läufe aus
 * `health_workouts` und reicht sie an `onStravaRunsLoaded` – AppMain hängt sie in `healthRuns` ein,
 * wo dieselbe automatische Zuordnung wie für Apple Health läuft.
 */
export function useStravaSync(args: {
  userId: string | null | undefined;
  connected: boolean | null;
  onStravaRunsLoaded: (runs: StoredHealthRun[]) => void;
  deps?: UseStravaSyncDeps;
}): StravaSyncUiState {
  const { userId, connected } = args;
  const enabled = Boolean(userId) && connected === true;

  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<StravaSyncResult | null>(null);
  const [reconnectRequired, setReconnectRequired] = useState(() => readState().lastStatus === "reconnect_required");

  const latest = useRef({ userId, enabled, onStravaRunsLoaded: args.onStravaRunsLoaded, deps: args.deps });
  latest.current = { userId, enabled, onStravaRunsLoaded: args.onStravaRunsLoaded, deps: args.deps };

  const controllerRef = useRef<StravaSyncController | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createStravaSyncController({
      runSync: async () => {
        const custom = latest.current.deps?.runSync;
        if (custom) return custom();
        return requestStravaSync({ baseUrl: getApiBaseUrl(), getAuthHeaders: getApiAuthHeaders });
      },
      onResult: async (result) => {
        setLastResult(result);
        if (result.status === "reconnect_required") setReconnectRequired(true);
        if (result.status === "ok") setReconnectRequired(false);
        if (result.status !== "ok") return;
        const uid = latest.current.userId;
        if (!uid) return;
        const load = latest.current.deps?.loadStravaRuns ?? loadStravaHealthWorkouts;
        const runs = await load(uid);
        if (runs) latest.current.onStravaRunsLoaded(runs);
      },
      nowEpochMs: () => {
        // Die App-Uhr steht zwischen Renders still; ein Resume kommt ohne Render.
        beginAppFrame();
        return getAppNowEpochMs();
      },
      readState,
      writeState,
    });
  }
  const controller = controllerRef.current;

  const pending = useRef(0);
  const run = useCallback(
    async (reason: StravaSyncReason) => {
      if (!latest.current.enabled) return;
      pending.current += 1;
      setBusy(true);
      try {
        await controller.trigger(reason);
      } finally {
        pending.current -= 1;
        if (pending.current === 0) setBusy(false);
      }
    },
    [controller],
  );

  // App-Start: einmal je Nutzer, sobald die Verbindung bestätigt ist.
  const coldStartDoneFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    if (coldStartDoneFor.current === userId) return;
    coldStartDoneFor.current = userId;
    void run("cold-start");
  }, [enabled, userId, run]);

  // Rückkehr in den Vordergrund.
  useEffect(() => {
    if (!enabled) return;
    const native = (args.deps?.isNativePlatform ?? (() => Capacitor.isNativePlatform()))();
    if (native) {
      const listenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void run("resume");
      });
      return () => {
        void listenerPromise
          .then((l) => l.remove())
          .catch((e) => console.warn("[stravaSync] listener cleanup failed", e));
      };
    }
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run("resume");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Plattform ändert sich zur Laufzeit nicht
  }, [enabled, run]);

  const syncNow = useCallback(() => run("manual"), [run]);
  const clearReconnectRequired = useCallback(() => {
    setReconnectRequired(false);
    const state = readState();
    if (state.lastStatus === "reconnect_required") writeState({ ...state, lastStatus: undefined });
  }, []);

  return { busy, lastResult, reconnectRequired: reconnectRequired && connected === true, syncNow, clearReconnectRequired };
}
