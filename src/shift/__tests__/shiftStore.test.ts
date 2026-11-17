import { act } from "@testing-library/react";
import { deleteShiftEntries, loadShiftEntries, upsertShiftEntries } from "../../lib/supabase/services/shiftEntriesService";
import { loadShiftProfile, saveShiftProfile } from "../../lib/supabase/services/shiftProfileService";
import { clearMarathonLocalStorage } from "../../persistence/clearMarathonLocalStorage";
import {
  getShiftState,
  loadShiftData,
  resetShiftStateForTests,
  saveShiftChanges,
  setWorksShifts,
  shiftEntriesCacheKey,
  shiftProfileCacheKey,
} from "../shiftStore";

jest.mock("../../lib/supabase/services/shiftEntriesService", () => ({
  ...jest.requireActual("../../lib/supabase/services/shiftEntriesService"),
  loadShiftEntries: jest.fn(),
  upsertShiftEntries: jest.fn(),
  deleteShiftEntries: jest.fn(),
}));
jest.mock("../../lib/supabase/services/shiftProfileService", () => ({
  ...jest.requireActual("../../lib/supabase/services/shiftProfileService"),
  loadShiftProfile: jest.fn(),
  saveShiftProfile: jest.fn(),
}));

const TODAY = "2026-11-16";

beforeEach(() => {
  localStorage.clear();
  resetShiftStateForTests();
  (loadShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
  (deleteShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: 0 });
  (loadShiftProfile as jest.Mock).mockResolvedValue({ status: "ok", value: { worksShifts: null, defaults: null } });
  (saveShiftProfile as jest.Mock).mockResolvedValue("ok");
});

describe("shiftStore – Cache je Nutzer", () => {
  it("ausstehende Tage von Konto A erscheinen nicht bei Konto B und werden nie in B gespeichert", async () => {
    (upsertShiftEntries as jest.Mock).mockResolvedValue({ status: "error", message: "offline" });
    await act(async () => {
      await loadShiftData("user-a", TODAY);
      await saveShiftChanges({ upserts: [{ dateYmd: TODAY, kind: "night", start: "22:00", end: "06:00", label: null }], deletes: [] });
    });
    expect(JSON.parse(localStorage.getItem(shiftEntriesCacheKey("user-a")) as string).pending).toEqual([TODAY]);

    (upsertShiftEntries as jest.Mock).mockClear();
    (upsertShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: 0 });
    await act(async () => {
      await loadShiftData("user-b", TODAY);
    });
    expect(getShiftState().userId).toBe("user-b");
    expect(getShiftState().entriesByDate).toEqual({});
    // Kein Nachreichen von A’s Tagen in Konto B.
    expect((upsertShiftEntries as jest.Mock).mock.calls.some(([uid, rows]) => uid === "user-b" && rows.length > 0)).toBe(false);
    expect(localStorage.getItem(shiftEntriesCacheKey("user-b"))).not.toContain("night");

    // Zurück bei A: der ausstehende Tag wird für A nachgereicht.
    await act(async () => {
      await loadShiftData("user-a", TODAY);
    });
    expect(upsertShiftEntries).toHaveBeenCalledWith("user-a", [expect.objectContaining({ dateYmd: TODAY, kind: "night" })]);
  });

  it("Abmelden/Konto löschen räumt die Schlüssel je Nutzer auf, fremde Präfixe bleiben", async () => {
    (upsertShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: 1 });
    await act(async () => {
      await loadShiftData("user-a", TODAY);
      await setWorksShifts(true);
      await saveShiftChanges({ upserts: [{ dateYmd: TODAY, kind: "early", start: "06:00", end: "14:00", label: null }], deletes: [] });
    });
    localStorage.setItem("marathonUsageEventsEnabled:user-a", "1");
    expect(localStorage.getItem(shiftEntriesCacheKey("user-a"))).not.toBeNull();
    expect(localStorage.getItem(shiftProfileCacheKey("user-a"))).not.toBeNull();

    clearMarathonLocalStorage();

    expect(localStorage.getItem(shiftEntriesCacheKey("user-a"))).toBeNull();
    expect(localStorage.getItem(shiftProfileCacheKey("user-a"))).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.startsWith("marathonShift"))).toEqual([]);
    // W3: bewusst konto-übergreifend, überlebt das Abmelden.
    expect(localStorage.getItem("marathonUsageEventsEnabled:user-a")).toBe("1");
  });
});
