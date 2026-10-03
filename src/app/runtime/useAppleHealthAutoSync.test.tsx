import React, { useEffect, useState } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { freezeTimeForTests, getAppNowEpochMs } from "../../core/time/timeSystem";
import { appleHealthWorkoutQueryRangeFromMidnightDaysBack } from "../../appleHealth/appleHealthService";
import { mergeHealthRuns, type StoredHealthRun } from "../../healthRuns";
import { applyAppleHealthTrainingSync } from "../../trainingIntelligence/applyAppleHealthSync";
import {
  APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS,
  createAppleHealthAutoSyncController,
  useAppleHealthAutoSync,
} from "./useAppleHealthAutoSync";

type AppStateListener = (state: { isActive: boolean }) => void;
const mockListeners: AppStateListener[] = [];
// Plain functions statt jest.fn: CRA setzt `resetMocks`, das würde die Implementierungen vor jedem Test leeren.
const mockState = { native: true, removed: 0 };

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mockState.native, getPlatform: () => "ios" },
}));

jest.mock("@capacitor/app", () => ({
  App: {
    addListener: (event: string, cb: AppStateListener) => {
      if (event === "appStateChange") mockListeners.push(cb);
      return Promise.resolve({
        remove: () => {
          mockState.removed += 1;
          const i = mockListeners.indexOf(cb);
          if (i >= 0) mockListeners.splice(i, 1);
        },
      });
    },
  },
}));

async function emitAppState(isActive: boolean) {
  await act(async () => {
    for (const cb of [...mockListeners]) cb({ isActive });
    await Promise.resolve();
    await Promise.resolve();
  });
}

const T0 = new Date("2026-10-03T08:00:00.000Z");
const at = (ms: number) => freezeTimeForTests(new Date(T0.getTime() + ms));

beforeEach(() => {
  mockListeners.length = 0;
  mockState.removed = 0;
  mockState.native = true;
  at(0);
});
afterEach(() => freezeTimeForTests(null));

describe("useAppleHealthAutoSync", () => {
  test("Resume (appStateChange → active) löst den Sync aus; Hintergrund nicht", async () => {
    const runSync = jest.fn(async () => 1);
    renderHook(() => useAppleHealthAutoSync(runSync));
    await act(async () => { await Promise.resolve(); });

    await emitAppState(false);
    expect(runSync).not.toHaveBeenCalled();

    await emitAppState(true);
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test("Drossel: innerhalb von 60 s kein zweiter Lauf, danach wieder", async () => {
    const runSync = jest.fn(async () => 1);
    renderHook(() => useAppleHealthAutoSync(runSync));
    await act(async () => { await Promise.resolve(); });

    await emitAppState(true);
    at(APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS - 1);
    await emitAppState(true);
    expect(runSync).toHaveBeenCalledTimes(1);

    at(APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS);
    await emitAppState(true);
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("Kaltstart und Resume teilen sich Drossel und Sperre", async () => {
    const runSync = jest.fn(async () => 1);
    const { result } = renderHook(() => useAppleHealthAutoSync(runSync));
    await act(async () => {
      expect(await result.current.trigger("cold-start")).toBe("synced");
    });
    await emitAppState(true);
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  test("paralleler Aufruf wird verhindert, solange ein Lauf noch läuft", async () => {
    let finish: () => void = () => {};
    const runSync = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useAppleHealthAutoSync(runSync));
    await act(async () => { await Promise.resolve(); });

    let first: Promise<string> = Promise.resolve("");
    act(() => { first = result.current.trigger("cold-start"); });
    // Hinter der Drossel (60 s), aber vor dem Höchstalter der Sperre (2 min) — nur die Sperre hält den zweiten Lauf auf.
    at(1.5 * APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS);
    await emitAppState(true);
    await act(async () => {
      expect(await result.current.trigger("resume")).toBe("in-flight");
    });
    expect(runSync).toHaveBeenCalledTimes(1);

    await act(async () => { finish(); await first; });
    at(20 * APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS);
    await emitAppState(true);
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  test("Fehler werden per console.warn gemeldet, nicht verschluckt, und sperren den nächsten Lauf nicht", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const boom = new Error("HealthKit weg");
    let calls = 0;
    const runSync = async () => {
      calls += 1;
      if (calls === 1) throw boom;
      return 1;
    };
    const { result } = renderHook(() => useAppleHealthAutoSync(runSync));

    await act(async () => {
      expect(await result.current.trigger("resume")).toBe("failed");
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("resume sync failed"), boom);

    at(APPLE_HEALTH_AUTO_SYNC_THROTTLE_MS);
    await act(async () => {
      expect(await result.current.trigger("resume")).toBe("synced");
    });
    warn.mockRestore();
  });

  test("nimmt immer die aktuelle Sync-Funktion, nicht die vom ersten Render", async () => {
    const first = jest.fn(async () => 1);
    const second = jest.fn(async () => 1);
    const { rerender } = renderHook((fn: () => Promise<unknown>) => useAppleHealthAutoSync(fn), { initialProps: first });
    await act(async () => { await Promise.resolve(); });
    rerender(second);
    await emitAppState(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("Web: kein Listener; Unmount entfernt den Listener", async () => {
    mockState.native = false;
    const { unmount: unmountWeb } = renderHook(() => useAppleHealthAutoSync(async () => 1));
    await act(async () => { await Promise.resolve(); });
    expect(mockListeners).toHaveLength(0);
    unmountWeb();

    mockState.native = true;
    const { unmount: unmountNative } = renderHook(() => useAppleHealthAutoSync(async () => 1));
    await act(async () => { await Promise.resolve(); });
    expect(mockListeners).toHaveLength(1);
    unmountNative();
    await act(async () => { await Promise.resolve(); });
    expect(mockState.removed).toBe(1);
    expect(mockListeners).toHaveLength(0);
  });
});

describe("createAppleHealthAutoSyncController — App-Uhr", () => {
  test("frischt die Uhr vor dem Sync auf: das Abfragefenster endet beim Resume, nicht beim letzten Render", async () => {
    // Uhr steht beim letzten Render (08:00); die echte Zeit ist inzwischen 09:30, der Lauf endete 09:10.
    let wallClock = T0.getTime();
    let frame = wallClock;
    const windowEnds: string[] = [];
    const controller = createAppleHealthAutoSyncController({
      refreshClock: () => { frame = wallClock; },
      nowEpochMs: () => frame,
      runSync: async () => {
        windowEnds.push(appleHealthWorkoutQueryRangeFromMidnightDaysBack(7, new Date(frame)).endIsoLogical);
      },
    });
    wallClock = T0.getTime() + 90 * 60_000;
    await controller.trigger("resume");

    const workoutEnd = new Date(T0.getTime() + 70 * 60_000).toISOString();
    expect(windowEnds[0]).toBe(new Date(wallClock).toISOString());
    expect(windowEnds[0] > workoutEnd).toBe(true);
  });

  test("hängender Lauf sperrt nicht für immer: nach dem Höchstalter startet ein neuer, mit Warnung", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let now = 0;
    let calls = 0;
    const controller = createAppleHealthAutoSyncController({
      refreshClock: () => {},
      nowEpochMs: () => now,
      runSync: () => {
        calls += 1;
        return calls === 1 ? new Promise(() => {}) : Promise.resolve();
      },
      staleLockMs: 120_000,
    });
    void controller.trigger("cold-start");
    now = 119_999;
    expect(await controller.trigger("resume")).toBe("in-flight");
    now = 120_000;
    expect(await controller.trigger("resume")).toBe("synced");
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("still pending"));
    warn.mockRestore();
  });

  test("zurückgestellte Uhr hält die Drossel nicht fest", async () => {
    let now = 10 * 60_000;
    const runSync = jest.fn(async () => 1);
    const controller = createAppleHealthAutoSyncController({ refreshClock: () => {}, nowEpochMs: () => now, runSync });
    await controller.trigger("resume");
    now = 60_000;
    expect(await controller.trigger("resume")).toBe("synced");
    expect(runSync).toHaveBeenCalledTimes(2);
  });
});

describe("useAppleHealthAutoSync — echte App-Uhr (nicht eingefroren)", () => {
  test("Resume ohne Render: der Sync sieht die aktuelle Zeit, das Abfragefenster schließt das neue Workout ein", async () => {
    const realNow = Date.now;
    let wall = T0.getTime();
    Date.now = () => wall;
    try {
      // Uhr läuft auf der (gemockten) Wanduhr; letzter „Render" um 08:00.
      freezeTimeForTests(null);
      const seen: Array<{ epoch: number; windowEnd: string }> = [];
      renderHook(() =>
        useAppleHealthAutoSync(async () => {
          seen.push({
            epoch: getAppNowEpochMs(),
            windowEnd: appleHealthWorkoutQueryRangeFromMidnightDaysBack(7).endIsoForQuery,
          });
        }),
      );
      await act(async () => { await Promise.resolve(); });
      expect(getAppNowEpochMs()).toBe(T0.getTime());

      // 90 min im Hintergrund, Lauf endete nach 70 min. Kein Render dazwischen — die Uhr steht noch.
      wall = T0.getTime() + 90 * 60_000;
      const workoutEnd = new Date(T0.getTime() + 70 * 60_000).toISOString();
      expect(appleHealthWorkoutQueryRangeFromMidnightDaysBack(7).endIsoForQuery < workoutEnd).toBe(true);

      await emitAppState(true);

      expect(seen).toHaveLength(1);
      expect(seen[0].epoch).toBe(wall);
      expect(seen[0].windowEnd > workoutEnd).toBe(true);
    } finally {
      Date.now = realNow;
      freezeTimeForTests(null);
    }
  });
});

describe("neues Workout → aktualisierter Log-State", () => {
  const planSessions = [{ id: "w1-sa", day: "Sa", date: "3. Okt", type: "easy", title: "Easy", km: 10, pace: "5:00–5:20/km" }] as any[];
  const newRun = {
    runId: "hk_new",
    startDate: "2026-10-03T08:15:00.000Z",
    duration: 3000,
    distanceMeters: 10_000,
    distanceUnknown: false,
    workoutType: "running",
    sourceName: "Apple Health",
  } as StoredHealthRun;

  /** Gleiche Kette wie in AppMain: Sync → setHealthRuns(merge) → applyAppleHealthTrainingSync → Logs. */
  function Harness({ fetchFromHealthKit }: { fetchFromHealthKit: () => Promise<StoredHealthRun[]> }) {
    const [healthRuns, setHealthRuns] = useState<StoredHealthRun[]>([]);
    const [logs, setLogs] = useState<Record<string, any>>({});
    useAppleHealthAutoSync(async () => {
      const incoming = await fetchFromHealthKit();
      setHealthRuns((prev) => mergeHealthRuns(prev, incoming));
    });
    useEffect(() => {
      if (!healthRuns.length) return;
      setLogs((prev) => {
        const result = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: prev });
        return result.changed ? result.logs : prev;
      });
    }, [healthRuns]);
    const log = logs["w1-sa"];
    return <div data-testid="state">{log?.done ? `done:${log.assignedRun?.runId}` : "open"}</div>;
  }

  test("Resume nach dem Lauf: Session wird ohne manuellen Schritt als erledigt mit zugeordnetem Workout geführt", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const fetchFromHealthKit = jest.fn(async () => [newRun]);
    render(<Harness fetchFromHealthKit={fetchFromHealthKit} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    at(90 * 60_000);
    await emitAppState(true);

    expect(fetchFromHealthKit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("done:hk_new");
    log.mockRestore();
  });
});
