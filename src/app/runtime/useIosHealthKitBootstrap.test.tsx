import { Capacitor } from "@capacitor/core";
import { act, renderHook } from "@testing-library/react";
import * as healthDataService from "../../health/healthDataService";
import { useIosHealthKitBootstrap } from "./useIosHealthKitBootstrap";

jest.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: jest.fn(() => "web"),
  },
}));

jest.mock("../../health/healthDataService", () => ({
  ...(jest.requireActual("../../health/healthDataService") as object),
  healthKitIsAvailable: jest.fn(async () => true),
  appleHealthCheckPermission: jest.fn(async () => true),
  shouldForceFullHealthKitReauth: jest.fn(() => false),
  healthKitFetchRecoveryDailyLast120Days: jest.fn(async () => []),
  healthKitRequestReadAuthorization: jest.fn(async () => undefined),
}));

describe("useIosHealthKitBootstrap", () => {
  const baseApi = (): Parameters<typeof useIosHealthKitBootstrap>[0] => ({
    appleHealthConnectedStorageKey: "marathonAppleHealthConnected",
    setHealthKitAvailable: jest.fn(),
    setSleepPermission: jest.fn(),
    setHrvPermission: jest.fn(),
    setRhrPermission: jest.fn(),
    setIsHealthConnected: jest.fn(),
    setRecoveryDailyRows: jest.fn(),
    fetchRunningWorkoutsLast7Days: jest.fn(async () => 0),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("web");
    (healthDataService.healthKitIsAvailable as jest.Mock).mockResolvedValue(true);
    (healthDataService.appleHealthCheckPermission as jest.Mock).mockResolvedValue(true);
    (healthDataService.shouldForceFullHealthKitReauth as jest.Mock).mockReturnValue(false);
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock).mockResolvedValue([]);
    (healthDataService.healthKitRequestReadAuthorization as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  it("no-ops on non-iOS platforms (availability probe never fires)", async () => {
    renderHook(() => useIosHealthKitBootstrap(baseApi()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(healthDataService.healthKitIsAvailable).not.toHaveBeenCalled();
  });

  it("mount-only: does not rerun iOS bootstrap work when identity props change", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");

    const api1 = baseApi();
    const { rerender } = renderHook((api: Parameters<typeof useIosHealthKitBootstrap>[0]) => useIosHealthKitBootstrap(api), {
      initialProps: api1,
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(healthDataService.healthKitIsAvailable).toHaveBeenCalledTimes(1);
    rerender(baseApi());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(healthDataService.healthKitIsAvailable).toHaveBeenCalledTimes(1);
  });

  it("keeps hydration retry timer at 1700ms scheduling a second fetch after first empty snapshot", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ date: "2026-05-09", sleepHours: 7 }]);

    jest.useFakeTimers();
    renderHook(() => useIosHealthKitBootstrap(baseApi()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1699);
      await Promise.resolve();
    });
    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(2);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("does not schedule retry hydration when the first authorized snapshot already has rows", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock).mockResolvedValue([
      { date: "2026-05-09", sleepHours: 7 },
    ]);

    jest.useFakeTimers();
    renderHook(() => useIosHealthKitBootstrap(baseApi()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("retry path stacks no second timer: advancing past 1700ms twice still yields only two fetches", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ date: "2026-05-09", sleepHours: 7 }]);

    jest.useFakeTimers();
    renderHook(() => useIosHealthKitBootstrap(baseApi()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(1700);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(2);

    await act(async () => {
      jest.advanceTimersByTime(1700);
      await Promise.resolve();
    });
    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("clears the 1700ms retry on unmount so no second hydration runs", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ date: "2026-05-09", sleepHours: 7 }]);

    jest.useFakeTimers();
    const { unmount } = renderHook(() => useIosHealthKitBootstrap(baseApi()));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(healthDataService.healthKitFetchRecoveryDailyLast120Days).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("merge reducer runs only for the retry fetch when first snapshot is empty (no double merge)", async () => {
    (Capacitor.getPlatform as jest.Mock).mockReturnValue("ios");
    (healthDataService.healthKitFetchRecoveryDailyLast120Days as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ date: "2026-05-09", sleepHours: 7 }]);

    const setRecoveryDailyRows = jest.fn();
    jest.useFakeTimers();
    renderHook(() =>
      useIosHealthKitBootstrap({
        ...baseApi(),
        setRecoveryDailyRows,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setRecoveryDailyRows).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1700);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setRecoveryDailyRows).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
