import { act, renderHook } from "@testing-library/react";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { STRAVA_SYNC_STATE_KEY } from "./stravaSync";
import { useStravaSync } from "./useStravaSync";

type AppStateListener = (state: { isActive: boolean }) => void;
const mockListeners: AppStateListener[] = [];

jest.mock("@capacitor/app", () => ({
  App: {
    addListener: (event: string, cb: AppStateListener) => {
      if (event === "appStateChange") mockListeners.push(cb);
      return Promise.resolve({
        remove: () => {
          const i = mockListeners.indexOf(cb);
          if (i >= 0) mockListeners.splice(i, 1);
        },
      });
    },
  },
}));
jest.mock("../lib/supabase/client", () => ({ supabase: {} }));

const T0 = new Date("2026-11-16T12:00:00.000Z");
const stravaRow = {
  runId: "strava:1",
  startDate: "2026-11-16T07:00:00.000Z",
  duration: 3000,
  distanceMeters: 10000,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Strava",
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  mockListeners.length = 0;
  freezeTimeForTests(T0);
});
afterEach(() => freezeTimeForTests(null));

function setup(opts: { native?: boolean; connected?: boolean | null; result?: any } = {}) {
  const runSync = jest.fn(async () => opts.result ?? { status: "ok", imported: 1, fetched: 1 });
  const loadStravaRuns = jest.fn(async () => [stravaRow]);
  const onStravaRunsLoaded = jest.fn();
  const onReconnectRequired = jest.fn();
  const recheckConnection = jest.fn();
  const view = renderHook(
    ({ connected }) =>
      useStravaSync({
        userId: "user-1",
        connected,
        onStravaRunsLoaded,
        onReconnectRequired,
        recheckConnection,
        deps: { runSync, loadStravaRuns, isNativePlatform: () => opts.native ?? false },
      }),
    { initialProps: { connected: opts.connected === undefined ? true : opts.connected } },
  );
  return { ...view, runSync, loadStravaRuns, onStravaRunsLoaded, onReconnectRequired, recheckConnection };
}

describe("useStravaSync", () => {
  test("ohne Verbindung passiert nichts", async () => {
    const { runSync } = setup({ connected: false });
    await flush();
    expect(runSync).not.toHaveBeenCalled();
  });

  test("App-Start: ein Abgleich, danach Strava-Läufe laden und weiterreichen", async () => {
    const { runSync, loadStravaRuns, onStravaRunsLoaded, rerender } = setup();
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(loadStravaRuns).toHaveBeenCalledWith("user-1");
    expect(onStravaRunsLoaded).toHaveBeenCalledWith([stravaRow]);
    rerender({ connected: true });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test("Verbindung wird erst später bestätigt → dann der Start-Abgleich", async () => {
    const { runSync, rerender } = setup({ connected: null });
    await flush();
    expect(runSync).not.toHaveBeenCalled();
    rerender({ connected: true });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test("Web: Rückkehr (visibilitychange) gedrosselt auf 15 min", async () => {
    const { runSync } = setup();
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
    freezeTimeForTests(new Date(T0.getTime() + 16 * 60000));
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("iOS: appStateChange → active löst aus, Hintergrund nicht", async () => {
    const { runSync } = setup({ native: true });
    await flush();
    expect(mockListeners).toHaveLength(1);
    freezeTimeForTests(new Date(T0.getTime() + 20 * 60000));
    await act(async () => mockListeners[0]({ isActive: false }));
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
    await act(async () => mockListeners[0]({ isActive: true }));
    await flush();
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("Status unbekannt (Offline-Start): Rückkehr in den Vordergrund prüft die Verbindung erneut", async () => {
    const { recheckConnection, runSync, rerender } = setup({ connected: null });
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(recheckConnection).toHaveBeenCalledTimes(1);
    expect(runSync).not.toHaveBeenCalled();
    // Prüfung ergibt „verbunden“ → Import läuft, weitere Rückkehr prüft nicht mehr.
    rerender({ connected: true });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(recheckConnection).toHaveBeenCalledTimes(1);
  });

  test("iOS: Status unbekannt → appStateChange prüft erneut", async () => {
    const { recheckConnection } = setup({ connected: null, native: true });
    await flush();
    await act(async () => mockListeners.forEach((cb) => cb({ isActive: true })));
    expect(recheckConnection).toHaveBeenCalledTimes(1);
  });

  test("„Jetzt synchronisieren“ ohne Drossel", async () => {
    const { result, runSync } = setup();
    await flush();
    await act(async () => {
      await result.current.syncNow();
    });
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("Trennen + neu verbinden in derselben Sitzung: erster Import läuft sofort, trotz Drossel", async () => {
    const { runSync, rerender } = setup();
    await flush();
    expect(runSync).toHaveBeenCalledTimes(1);
    rerender({ connected: false });
    await flush();
    freezeTimeForTests(new Date(T0.getTime() + 2 * 60000));
    rerender({ connected: true });
    await flush();
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("reconnect_required wird angezeigt und über Neustarts gemerkt, nichts geladen", async () => {
    const { result, loadStravaRuns, unmount, onReconnectRequired } = setup({ result: { status: "reconnect_required" } });
    await flush();
    expect(result.current.reconnectRequired).toBe(true);
    expect(onReconnectRequired).toHaveBeenCalledTimes(1);
    expect(loadStravaRuns).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STRAVA_SYNC_STATE_KEY) || "{}").lastStatus).toBe("reconnect_required");
    unmount();

    // Neustart innerhalb der Drossel: kein neuer Abgleich, Hinweis bleibt.
    const second = setup({ result: { status: "ok", imported: 0, fetched: 0 } });
    await flush();
    expect(second.runSync).not.toHaveBeenCalled();
    expect(second.result.current.reconnectRequired).toBe(true);
    act(() => second.result.current.clearReconnectRequired());
    expect(second.result.current.reconnectRequired).toBe(false);
  });
});
