import { freezeTimeForTests } from "../core/time/timeSystem";
import type { RawCalendarOccurrence } from "./eventToScheduleBlocks";

jest.mock("./calendarImportService", () => ({
  calendarCheckReadPermission: jest.fn(async () => "granted"),
  fetchCalendarOccurrences: jest.fn(async () => []),
}));
jest.mock("../lib/supabase/services/weeklyScheduleBlocksService", () => {
  const actual = jest.requireActual("../lib/supabase/services/weeklyScheduleBlocksService");
  return {
    ...actual,
    loadWeeklyScheduleBlocks: jest.fn(async () => []),
    replaceAllEventkitBlocks: jest.fn(async () => ({ ok: true, insertedCount: 0 })),
  };
});

import { calendarCheckReadPermission, fetchCalendarOccurrences } from "./calendarImportService";
import {
  loadWeeklyScheduleBlocks,
  replaceAllEventkitBlocks,
} from "../lib/supabase/services/weeklyScheduleBlocksService";
import {
  CALENDAR_CONNECTED_KEY,
  clearCalendarImportConnected,
  computeCalendarConnectionDisplay,
  isCalendarImportConnected,
  markCalendarImportConnected,
  runCalendarForegroundResync,
  runCalendarWindowSync,
} from "./calendarSyncService";

const USER_ID = "user-1";

function occurrence(overrides: Partial<RawCalendarOccurrence> = {}): RawCalendarOccurrence {
  return {
    title: "Vorlesung",
    calendarTitle: "Uni",
    calendarType: "calDAV",
    startMs: new Date(2026, 7, 25, 10, 0).getTime(),
    endMs: new Date(2026, 7, 25, 12, 0).getTime(),
    isAllDay: false,
    status: "confirmed",
    ...overrides,
  };
}

beforeEach(() => {
  // CRA-Jest läuft mit resetMocks:true — Default-Implementierungen daher hier statt in der Factory.
  (calendarCheckReadPermission as jest.Mock).mockResolvedValue("granted");
  (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([]);
  (replaceAllEventkitBlocks as jest.Mock).mockResolvedValue({ ok: true, insertedCount: 0 });
  (loadWeeklyScheduleBlocks as jest.Mock).mockResolvedValue([]);
  localStorage.clear();
  freezeTimeForTests(new Date(2026, 7, 24, 12, 0)); // Montag, 24.08.2026
});

afterEach(() => {
  freezeTimeForTests(null);
});

describe("runCalendarWindowSync", () => {
  it("fragt das 28-Tage-Fenster ab lokaler Mitternacht ab und schreibt gemappte Blöcke", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([occurrence()]);
    (replaceAllEventkitBlocks as jest.Mock).mockResolvedValue({ ok: true, insertedCount: 1 });

    const result = await runCalendarWindowSync(USER_ID);

    expect(result).toEqual({ ok: true, importedCount: 1 });
    const [fromMs, toMs] = (fetchCalendarOccurrences as jest.Mock).mock.calls[0];
    expect(fromMs).toBe(new Date(2026, 7, 24).getTime());
    expect(toMs).toBe(new Date(2026, 8, 21).getTime()); // +28 Tage, exklusives Ende

    const [userId, blocks] = (replaceAllEventkitBlocks as jest.Mock).mock.calls[0];
    expect(userId).toBe(USER_ID);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ source: "eventkit", specificDate: "2026-08-25" });
  });

  it("meldet die insertedCount des Write-Layers als importedCount", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([
      occurrence(),
      occurrence({ startMs: new Date(2026, 7, 26, 9, 0).getTime(), endMs: new Date(2026, 7, 26, 10, 0).getTime() }),
    ]);
    (replaceAllEventkitBlocks as jest.Mock).mockResolvedValue({ ok: true, insertedCount: 2 });

    await expect(runCalendarWindowSync(USER_ID)).resolves.toEqual({ ok: true, importedCount: 2 });
  });

  it("schreibt NICHT, wenn der Fetch fehlschlägt (Fehler darf den Import nicht leeren)", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue(null);

    const result = await runCalendarWindowSync(USER_ID);

    expect(result).toEqual({ ok: false, importedCount: 0, error: "fetch-failed" });
    expect(replaceAllEventkitBlocks).not.toHaveBeenCalled();
  });

  it("leerer Kalender leert die eventkit-Zeilen bewusst (Replace-All mit leerer Liste)", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([]);

    const result = await runCalendarWindowSync(USER_ID);

    expect(result).toEqual({ ok: true, importedCount: 0 });
    expect(replaceAllEventkitBlocks).toHaveBeenCalledWith(USER_ID, []);
  });

  it("meldet write-failed und setzt keinen Sync-Anchor, wenn der Write scheitert", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([occurrence()]);
    (replaceAllEventkitBlocks as jest.Mock).mockResolvedValue({ ok: false, insertedCount: 0 });

    const result = await runCalendarWindowSync(USER_ID);

    expect(result).toEqual({ ok: false, importedCount: 0, error: "write-failed" });
    expect(localStorage.getItem("calendarSyncAnchors")).toBeNull();
  });

  it("setzt lastSyncAt nach erfolgreichem Sync", async () => {
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([]);

    await runCalendarWindowSync(USER_ID);

    const anchors = JSON.parse(localStorage.getItem("calendarSyncAnchors") ?? "{}");
    expect(anchors.lastSyncAt).toBe(new Date(2026, 7, 24, 12, 0).toISOString());
  });
});

describe("runCalendarForegroundResync", () => {
  it("no-op ohne Connected-Marker", async () => {
    await expect(runCalendarForegroundResync(USER_ID)).resolves.toBeNull();
    expect(calendarCheckReadPermission).not.toHaveBeenCalled();
    expect(fetchCalendarOccurrences).not.toHaveBeenCalled();
  });

  it("no-op, wenn die Berechtigung inzwischen entzogen wurde", async () => {
    markCalendarImportConnected();
    (calendarCheckReadPermission as jest.Mock).mockResolvedValue("denied");

    await expect(runCalendarForegroundResync(USER_ID)).resolves.toBeNull();
    expect(fetchCalendarOccurrences).not.toHaveBeenCalled();
  });

  it("synct und liefert die frisch geladene Gesamt-Blockliste", async () => {
    markCalendarImportConnected();
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue([occurrence()]);
    (replaceAllEventkitBlocks as jest.Mock).mockResolvedValue({ ok: true, insertedCount: 1 });
    const freshBlocks = [{ id: "x" }];
    (loadWeeklyScheduleBlocks as jest.Mock).mockResolvedValue(freshBlocks);

    await expect(runCalendarForegroundResync(USER_ID)).resolves.toBe(freshBlocks);
  });

  it("liefert null (State unangetastet), wenn der Sync fehlschlägt", async () => {
    markCalendarImportConnected();
    (fetchCalendarOccurrences as jest.Mock).mockResolvedValue(null);

    await expect(runCalendarForegroundResync(USER_ID)).resolves.toBeNull();
    expect(loadWeeklyScheduleBlocks).not.toHaveBeenCalled();
  });
});

describe("connected marker", () => {
  it("isCalendarImportConnected spiegelt den localStorage-Marker", () => {
    expect(isCalendarImportConnected()).toBe(false);
    markCalendarImportConnected();
    expect(localStorage.getItem(CALENDAR_CONNECTED_KEY)).toBe("1");
    expect(isCalendarImportConnected()).toBe(true);
  });

  it("clearCalendarImportConnected setzt den Marker zurück (Settings-Trennen)", () => {
    markCalendarImportConnected();
    expect(isCalendarImportConnected()).toBe(true);

    clearCalendarImportConnected();

    expect(isCalendarImportConnected()).toBe(false);
    expect(localStorage.getItem(CALENDAR_CONNECTED_KEY)).toBeNull();
  });
});

describe("computeCalendarConnectionDisplay", () => {
  it("granted + connected → connected/disconnect", () => {
    expect(computeCalendarConnectionDisplay("granted", true)).toEqual({
      badge: "connected",
      action: "disconnect",
    });
  });

  it("granted + nicht (mehr) lokal verbunden → not-connected/request-access (kein zweiter OS-Dialog nötig)", () => {
    expect(computeCalendarConnectionDisplay("granted", false)).toEqual({
      badge: "not-connected",
      action: "request-access",
    });
  });

  it("prompt (notDetermined) → not-connected/request-access", () => {
    expect(computeCalendarConnectionDisplay("prompt", false)).toEqual({
      badge: "not-connected",
      action: "request-access",
    });
  });

  it("denied → denied/open-settings, unabhängig vom lokalen Flag", () => {
    expect(computeCalendarConnectionDisplay("denied", false)).toEqual({
      badge: "denied",
      action: "open-settings",
    });
    expect(computeCalendarConnectionDisplay("denied", true)).toEqual({
      badge: "denied",
      action: "open-settings",
    });
  });

  it("unavailable → unavailable/none", () => {
    expect(computeCalendarConnectionDisplay("unavailable", false)).toEqual({
      badge: "unavailable",
      action: "none",
    });
  });
});
