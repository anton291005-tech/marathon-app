import { act, renderHook } from "@testing-library/react";
import * as healthDataService from "../../health/healthDataService";
import { freezeTimeForTests } from "../../core/time/timeSystem";
import { useAppleHealthAutoSync } from "./useAppleHealthAutoSync";
import { useIosHealthKitBootstrap } from "./useIosHealthKitBootstrap";

// Plain functions statt jest.fn: CRA setzt `resetMocks`.
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
}));

jest.mock("@capacitor/app", () => ({
  App: { addListener: () => Promise.resolve({ remove: () => {} }) },
}));

jest.mock("../../health/healthDataService", () => ({
  ...(jest.requireActual("../../health/healthDataService") as object),
  healthKitIsAvailable: jest.fn(),
  appleHealthCheckPermission: jest.fn(),
  shouldForceFullHealthKitReauth: jest.fn(),
  healthKitFetchRecoveryDailyLast120Days: jest.fn(),
  healthKitRequestReadAuthorization: jest.fn(),
}));

const CONNECTED_KEY = "marathonAppleHealthConnected";

/** Verdrahtung wie in AppMain: Bootstrap bekommt einen Wrapper um den Auto-Sync-Controller. */
function useColdStartWiring(fetchWorkouts: () => Promise<number>) {
  const autoSync = useAppleHealthAutoSync(() => fetchWorkouts());
  useIosHealthKitBootstrap({
    appleHealthConnectedStorageKey: CONNECTED_KEY,
    setHealthKitAvailable: () => {},
    setSleepPermission: () => {},
    setHrvPermission: () => {},
    setRhrPermission: () => {},
    setIsHealthConnected: () => {},
    setRecoveryDailyRows: () => {},
    fetchRunningWorkoutsLast7Days: async () => {
      await autoSync.trigger("cold-start");
      return 0;
    },
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

describe("Kaltstart-Sync über den Auto-Sync-Controller", () => {
  beforeEach(() => {
    localStorage.clear();
    freezeTimeForTests(new Date("2026-10-03T08:00:00.000Z"));
    (healthDataService.healthKitIsAvailable as jest.Mock).mockResolvedValue(true);
    (healthDataService.appleHealthCheckPermission as jest.Mock).mockResolvedValue(true);
    (healthDataService.shouldForceFullHealthKitReauth as jest.Mock).mockReturnValue(false);
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock).mockResolvedValue([{ date: "2026-10-02" }]);
    (healthDataService.healthKitRequestReadAuthorization as jest.Mock).mockResolvedValue(undefined);
  });
  afterEach(() => freezeTimeForTests(null));

  test("läuft pro App-Start genau einmal — auch bei Re-Renders vor, während und nach dem Bootstrap", async () => {
    localStorage.setItem(CONNECTED_KEY, "1");
    const calls: string[] = [];
    const makeFetch = (label: string) => async () => {
      calls.push(label);
      return 1;
    };

    const { rerender } = renderHook((fn: () => Promise<number>) => useColdStartWiring(fn), {
      initialProps: makeFetch("render-1"),
    });
    // Re-Renders mit neuer Funktions-Identität, bevor der async Bootstrap beim Fetch ankommt.
    rerender(makeFetch("render-2"));
    rerender(makeFetch("render-3"));
    await flush();
    expect(calls).toHaveLength(1);

    // Weitere Re-Renders danach — auch weit hinter der 60-s-Drossel — lösen keinen zweiten Kaltstart-Sync aus.
    freezeTimeForTests(new Date("2026-10-03T09:00:00.000Z"));
    for (let i = 4; i <= 8; i++) rerender(makeFetch(`render-${i}`));
    await flush();

    expect(calls).toHaveLength(1);
    // Freigegebene Abweichung: es läuft die Fetch-Funktion des aktuellen Renders, nicht die des ersten.
    expect(calls[0]).toBe("render-3");
    expect(healthDataService.healthKitIsAvailable).toHaveBeenCalledTimes(1);
  });

  test("ohne Connected-Marker läuft beim Kaltstart kein Sync (Bedingung unverändert)", async () => {
    const calls: string[] = [];
    const { rerender } = renderHook((fn: () => Promise<number>) => useColdStartWiring(fn), {
      initialProps: async () => {
        calls.push("x");
        return 1;
      },
    });
    rerender(async () => {
      calls.push("y");
      return 1;
    });
    await flush();
    expect(calls).toHaveLength(0);
  });
});
