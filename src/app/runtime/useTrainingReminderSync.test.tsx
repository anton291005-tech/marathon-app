import React from "react";
import { act, render, renderHook } from "@testing-library/react";
import { freezeTimeForTests, getAppTodayYmd } from "../../core/time/timeSystem";
import type { PlanWeek } from "../../marathonPrediction";
import { getPrepCompletionState } from "../../prepRecap/prepCompletionState";
import { NotificationProvider, useNotifications } from "../../context/NotificationContext";
import { useTrainingReminderSync } from "./useTrainingReminderSync";

type AppStateListener = (state: { isActive: boolean }) => void;
type Scheduled = { id: number; body: string; title: string; schedule: { at: Date; repeats?: boolean; every?: string } };
const mockListeners: AppStateListener[] = [];
// Plain functions statt jest.fn: CRA setzt `resetMocks`, das würde die Implementierungen vor jedem Test leeren.
const mockNative = {
  permission: "granted",
  /** Ausstehende Notifications, wie iOS sie halten würde. */
  pending: new Map<number, Scheduled>(),
  scheduleCalls: 0,
  requested: 0,
};

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
}));

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

jest.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: mockNative.permission }),
    requestPermissions: async () => {
      mockNative.requested += 1;
      return { display: mockNative.permission };
    },
    cancel: async ({ notifications }: { notifications: Array<{ id: number }> }) => {
      for (const n of notifications) mockNative.pending.delete(n.id);
    },
    schedule: async ({ notifications }: { notifications: Scheduled[] }) => {
      mockNative.scheduleCalls += 1;
      for (const n of notifications) mockNative.pending.set(n.id, n);
    },
  },
}));

const session = (id: string, dateIso: string, type = "easy") => ({ id, day: "", date: "", dateIso, type, title: id, km: 8 });

const planA = [
  { wn: 11, s: [session("a", "2026-09-21", "rest"), session("b", "2026-09-22"), session("c", "2026-09-24")] },
  { wn: 12, s: [session("f", "2026-09-26", "rest"), session("race", "2026-09-27", "race")] },
] as unknown as PlanWeek[];

const planB = [
  { wn: 1, s: [session("n1", "2026-09-23"), session("n2", "2026-09-25", "rest"), session("n3", "2026-09-28", "long")] },
] as unknown as PlanWeek[];

const ON = { enabled: true, hour: 8, minute: 0 };
const OFF = { ...ON, enabled: false };

type Props = { plan: PlanWeek[]; logs: Record<string, any>; settings: typeof ON };

function propsFor(p: Props) {
  const todayYmd = getAppTodayYmd();
  return {
    settings: p.settings,
    plan: p.plan,
    logs: p.logs,
    prepCompleted:
      getPrepCompletionState({ plan: p.plan, logs: p.logs, todayYmd, preferences: {} as any }).status === "completed",
    todayYmd,
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

async function mount(initial: Props) {
  const view = renderHook((p: Props) => useTrainingReminderSync(propsFor(p)), { initialProps: initial });
  await flush();
  return view;
}

async function resume() {
  await act(async () => {
    for (const cb of [...mockListeners]) cb({ isActive: true });
  });
  await flush();
}

const pendingDays = () =>
  [...mockNative.pending.values()]
    .map((n) => `${n.schedule.at.getFullYear()}-${String(n.schedule.at.getMonth() + 1).padStart(2, "0")}-${String(n.schedule.at.getDate()).padStart(2, "0")}`)
    .sort();

const legacyDaily: Scheduled = {
  id: 1001,
  title: "MyRace 🏃",
  body: "Dein Training wartet auf dich 💪",
  schedule: { at: new Date(2026, 8, 21, 8), repeats: true, every: "day" },
};

describe("useTrainingReminderSync", () => {
  beforeEach(() => {
    mockListeners.length = 0;
    mockNative.permission = "granted";
    mockNative.pending.clear();
    mockNative.scheduleCalls = 0;
    mockNative.requested = 0;
    localStorage.clear();
    freezeTimeForTests(new Date(2026, 8, 21, 6, 0, 0));
  });

  afterEach(() => freezeTimeForTests(null));

  it("Plan läuft: Einzel-Erinnerungen nur an Session-Tagen, nie wiederholend; die alte id 1001 ist weg", async () => {
    mockNative.pending.set(1001, legacyDaily);
    await mount({ plan: planA, logs: {}, settings: ON });
    expect(pendingDays()).toEqual(["2026-09-22", "2026-09-24", "2026-09-27"]);
    expect(mockNative.pending.has(1001)).toBe(false);
    for (const n of mockNative.pending.values()) {
      expect(n.schedule.repeats).toBeUndefined();
      expect(n.schedule.every).toBeUndefined();
      expect(n.schedule.at.getHours()).toBe(8);
      expect(n.body).toBe("Dein Training wartet auf dich 💪");
      expect(n.title).toBe("MyRace 🏃");
    }
  });

  it("Plan abgeschlossen: keine ausstehenden Erinnerungen — beim Start und beim Resume nach dem Renntag", async () => {
    await mount({ plan: planA, logs: {}, settings: ON });
    expect(mockNative.pending.size).toBe(3);

    // App bleibt im Hintergrund, kommt am Tag nach dem Rennen zurück (kein Render dazwischen).
    freezeTimeForTests(new Date(2026, 8, 28, 7, 0, 0));
    await resume();
    expect(mockNative.pending.size).toBe(0);

    const scheduledBefore = mockNative.scheduleCalls;
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    expect(mockNative.pending.size).toBe(0);
    expect(mockNative.scheduleCalls).toBe(scheduledBefore);
    view.unmount();
  });

  it("Rennen abgehakt am Renntag: sofort keine Erinnerungen mehr", async () => {
    freezeTimeForTests(new Date(2026, 8, 27, 6, 0, 0));
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    expect(pendingDays()).toEqual(["2026-09-27"]);
    view.rerender({ plan: planA, logs: { race: { done: true } }, settings: ON });
    await flush();
    expect(mockNative.pending.size).toBe(0);
  });

  it("abgehakte Session: der Tag fällt aus den Erinnerungen", async () => {
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    view.rerender({ plan: planA, logs: { b: { done: true } }, settings: ON });
    await flush();
    expect(pendingDays()).toEqual(["2026-09-24", "2026-09-27"]);
  });

  it("Planwechsel / neue Vorbereitung: neu geplant aus dem neuen aktiven Plan, nichts vom alten bleibt", async () => {
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    view.rerender({ plan: planB, logs: {}, settings: ON });
    await flush();
    expect(pendingDays()).toEqual(["2026-09-23", "2026-09-28"]);
  });

  it("Plan gelöscht (kein aktiver Plan): alles storniert", async () => {
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    view.rerender({ plan: [], logs: {}, settings: ON });
    await flush();
    expect(mockNative.pending.size).toBe(0);
  });

  it("Schalter aus: alles storniert; wieder an: neu geplant; neue Uhrzeit: neu geplant", async () => {
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    view.rerender({ plan: planA, logs: {}, settings: OFF });
    await flush();
    expect(mockNative.pending.size).toBe(0);
    view.rerender({ plan: planA, logs: {}, settings: ON });
    await flush();
    expect(mockNative.pending.size).toBe(3);
    view.rerender({ plan: planA, logs: {}, settings: { ...ON, hour: 18, minute: 30 } });
    await flush();
    expect([...mockNative.pending.values()].map((n) => `${n.schedule.at.getHours()}:${n.schedule.at.getMinutes()}`)).toEqual([
      "18:30",
      "18:30",
      "18:30",
    ]);
  });

  it("ohne Berechtigung: nichts geplant, kein Berechtigungs-Dialog aus dem Sync", async () => {
    mockNative.permission = "denied";
    await mount({ plan: planA, logs: {}, settings: ON });
    expect(mockNative.pending.size).toBe(0);
    expect(mockNative.requested).toBe(0);
  });

  it("Resume rollt das Fenster weiter", async () => {
    const far = [{ wn: 1, s: [session("x", "2026-09-22"), session("y", "2026-10-10")] }] as unknown as PlanWeek[];
    await mount({ plan: far, logs: {}, settings: ON });
    expect(pendingDays()).toEqual(["2026-09-22"]);
    freezeTimeForTests(new Date(2026, 8, 30, 7, 0, 0));
    await resume();
    expect(pendingDays()).toEqual(["2026-10-10"]);
  });

  it("App-Shell verschwindet (Logout): storniert", async () => {
    const view = await mount({ plan: planA, logs: {}, settings: ON });
    view.unmount();
    await flush();
    expect(mockNative.pending.size).toBe(0);
  });
});

describe("NotificationProvider", () => {
  beforeEach(() => {
    mockNative.permission = "granted";
    mockNative.pending.clear();
    mockNative.requested = 0;
    localStorage.clear();
  });

  function Probe({ onReady }: { onReady: (api: ReturnType<typeof useNotifications>) => void }) {
    onReady(useNotifications());
    return null;
  }

  it("storniert beim Start die alte tägliche Erinnerung und plant selbst nichts", async () => {
    mockNative.pending.set(1001, legacyDaily);
    localStorage.setItem("myrace-notification-settings", JSON.stringify(ON));
    render(<NotificationProvider><Probe onReady={() => {}} /></NotificationProvider>);
    await flush();
    expect(mockNative.pending.size).toBe(0);
  });

  it("Schalter an fragt die Berechtigung an; Schalter aus storniert alle ausstehenden", async () => {
    let api!: ReturnType<typeof useNotifications>;
    render(<NotificationProvider><Probe onReady={(a) => (api = a)} /></NotificationProvider>);
    await flush();
    await act(async () => {
      await api.updateSettings({ enabled: true });
    });
    expect(mockNative.requested).toBe(1);
    expect(api.settings.enabled).toBe(true);
    expect(mockNative.pending.size).toBe(0);

    mockNative.pending.set(1100, { ...legacyDaily, id: 1100, schedule: { at: new Date(2026, 8, 22, 8) } });
    await act(async () => {
      await api.updateSettings({ enabled: false });
    });
    expect(mockNative.pending.size).toBe(0);
    expect(JSON.parse(localStorage.getItem("myrace-notification-settings")!).enabled).toBe(false);
  });
});
