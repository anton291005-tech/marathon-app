import { supabase } from "../client";
import { isMissingSchemaError } from "../schemaErrors";
import {
  dbRowToShiftEntry,
  deleteShiftEntries,
  loadShiftEntries,
  normalizeShiftTime,
  shiftEntryToRow,
  upsertShiftEntries,
} from "./shiftEntriesService";
import { loadShiftProfile, sanitizeShiftDefaults, saveShiftProfile } from "./shiftProfileService";

jest.mock("../client", () => ({
  supabase: { from: jest.fn() },
}));

const USER = "user-1";
const from = supabase.from as jest.Mock;

/** Kette select().eq().gte().lte().order() → Ergebnis. */
function mockSelect(result: { data?: unknown; error?: unknown }) {
  const order = jest.fn(async () => result);
  const lte = jest.fn(() => ({ order }));
  const gte = jest.fn(() => ({ lte }));
  const eq = jest.fn(() => ({ gte }));
  const select = jest.fn(() => ({ eq }));
  from.mockReturnValue({ select });
  return { select, eq, gte, lte, order };
}

beforeEach(() => jest.clearAllMocks());

describe("shiftEntriesService – Abbildung", () => {
  it("normalisiert Postgres-Zeiten und lehnt ungültige ab", () => {
    expect(normalizeShiftTime("06:00:00")).toBe("06:00");
    expect(normalizeShiftTime("6:30")).toBe("06:30");
    expect(normalizeShiftTime("25:00")).toBeNull();
    expect(normalizeShiftTime(null)).toBeNull();
  });

  it("Zeile → Eintrag; frei ohne Zeiten; kaputte Zeilen fallen weg", () => {
    expect(dbRowToShiftEntry({ user_id: USER, shift_date: "2026-11-17", kind: "night", start_time: "22:00:00", end_time: "06:00:00", label: null })).toEqual({
      dateYmd: "2026-11-17",
      kind: "night",
      start: "22:00",
      end: "06:00",
      label: null,
    });
    expect(dbRowToShiftEntry({ user_id: USER, shift_date: "2026-11-18", kind: "off", start_time: null, end_time: null, label: null })?.kind).toBe("off");
    expect(dbRowToShiftEntry({ user_id: USER, shift_date: "2026-11-18", kind: "night", start_time: null, end_time: null, label: null })).toBeNull();
    expect(dbRowToShiftEntry({ user_id: USER, shift_date: "2026-11-18", kind: "weird", start_time: null, end_time: null, label: null })).toBeNull();
  });

  it("Eintrag → Zeile erfüllt die CHECK-Regel (frei ohne Zeiten, sonst beide)", () => {
    expect(shiftEntryToRow(USER, { dateYmd: "2026-11-18", kind: "off", start: "06:00", end: "14:00", label: null })).toMatchObject({
      kind: "off",
      start_time: null,
      end_time: null,
    });
    expect(shiftEntryToRow(USER, { dateYmd: "2026-11-18", kind: "custom", start: "17:00", end: null, label: null })).toBeNull();
  });
});

describe("shiftEntriesService – laden", () => {
  it("lädt den Datumsbereich des Nutzers", async () => {
    const chain = mockSelect({
      data: [
        { shift_date: "2026-11-17", kind: "early", start_time: "06:00:00", end_time: "14:00:00", label: null },
        { shift_date: "2026-11-18", kind: "bogus", start_time: null, end_time: null, label: null },
      ],
      error: null,
    });
    const result = await loadShiftEntries(USER, "2026-11-17", "2026-12-14");
    expect(from).toHaveBeenCalledWith("shift_entries");
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER);
    expect(chain.gte).toHaveBeenCalledWith("shift_date", "2026-11-17");
    expect(chain.lte).toHaveBeenCalledWith("shift_date", "2026-12-14");
    expect(result).toEqual({ status: "ok", value: [{ dateYmd: "2026-11-17", kind: "early", start: "06:00", end: "14:00", label: null }] });
  });

  it.each(["42P01", "PGRST205", "42703", "PGRST204"])("fehlende Tabelle/Spalte (%s) → unavailable statt Fehler", async (code) => {
    mockSelect({ data: null, error: { code, message: "missing" } });
    await expect(loadShiftEntries(USER, "2026-11-17", "2026-12-14")).resolves.toEqual({ status: "unavailable" });
  });

  it("anderer Fehler → error; Ausnahme → error, kein Absturz", async () => {
    mockSelect({ data: null, error: { code: "08006", message: "offline" } });
    await expect(loadShiftEntries(USER, "2026-11-17", "2026-12-14")).resolves.toEqual({ status: "error", message: "offline" });
    from.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(loadShiftEntries(USER, "2026-11-17", "2026-12-14")).resolves.toMatchObject({ status: "error" });
    from.mockReset();
  });
});

describe("shiftEntriesService – speichern und löschen", () => {
  it("ein Bulk-Upsert über user_id+shift_date, ein Eintrag je Tag (der letzte gewinnt)", async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    from.mockReturnValue({ upsert });
    const result = await upsertShiftEntries(USER, [
      { dateYmd: "2026-11-18", kind: "early", start: "06:00", end: "14:00", label: null },
      { dateYmd: "2026-11-17", kind: "night", start: "22:00", end: "06:00", label: null },
      { dateYmd: "2026-11-18", kind: "late", start: "14:00", end: "22:00", label: null },
      { dateYmd: "kaputt", kind: "late", start: "14:00", end: "22:00", label: null },
    ]);
    expect(result).toEqual({ status: "ok", value: 2 });
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] as unknown as [Array<Record<string, unknown>>, Record<string, unknown>];
    expect(options).toEqual({ onConflict: "user_id,shift_date" });
    expect(rows.map((r) => [r.shift_date, r.kind])).toEqual([
      ["2026-11-17", "night"],
      ["2026-11-18", "late"],
    ]);
    expect(rows.every((r) => r.user_id === USER)).toBe(true);
  });

  it("Upsert ohne Tabelle → unavailable", async () => {
    from.mockReturnValue({ upsert: jest.fn(async () => ({ error: { code: "42P01", message: "relation does not exist" } })) });
    await expect(upsertShiftEntries(USER, [{ dateYmd: "2026-11-18", kind: "off", start: null, end: null, label: null }])).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("leere Liste schreibt nichts", async () => {
    await expect(upsertShiftEntries(USER, [])).resolves.toEqual({ status: "ok", value: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it("löscht nur die angegebenen Tage des Nutzers", async () => {
    const inFn = jest.fn(async () => ({ error: null }));
    const eq = jest.fn(() => ({ in: inFn }));
    const del = jest.fn(() => ({ eq }));
    from.mockReturnValue({ delete: del });
    await expect(deleteShiftEntries(USER, ["2026-11-18", "nope"])).resolves.toEqual({ status: "ok", value: 1 });
    expect(eq).toHaveBeenCalledWith("user_id", USER);
    expect(inFn).toHaveBeenCalledWith("shift_date", ["2026-11-18"]);
  });
});

describe("shiftProfileService", () => {
  it("liest works_shifts und gültige Standardzeiten", async () => {
    const maybeSingle = jest.fn(async () => ({
      data: { works_shifts: true, shift_defaults: { early: { start: "05:30", end: "13:30" }, late: { start: "x", end: "y" } } },
      error: null,
    }));
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    await expect(loadShiftProfile(USER)).resolves.toEqual({
      status: "ok",
      value: { worksShifts: true, defaults: { early: { start: "05:30", end: "13:30" } } },
    });
  });

  it("fehlende Spalte → unavailable (Rückfall lokal)", async () => {
    const maybeSingle = jest.fn(async () => ({ data: null, error: { code: "42703", message: "column profiles.works_shifts does not exist" } }));
    from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) });
    await expect(loadShiftProfile(USER)).resolves.toEqual({ status: "unavailable" });
  });

  it("speichert nur übergebene Felder", async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    from.mockReturnValue({ upsert });
    await expect(saveShiftProfile(USER, { worksShifts: false })).resolves.toBe("ok");
    expect(upsert).toHaveBeenCalledWith({ user_id: USER, works_shifts: false }, { onConflict: "user_id" });
    upsert.mockResolvedValueOnce({ error: { code: "PGRST204", message: "Could not find the 'works_shifts' column" } } as never);
    await expect(saveShiftProfile(USER, { worksShifts: true })).resolves.toBe("unavailable");
  });

  it("sanitizeShiftDefaults verwirft fremde Formen", () => {
    expect(sanitizeShiftDefaults(null)).toBeNull();
    expect(sanitizeShiftDefaults([1, 2])).toBeNull();
    expect(sanitizeShiftDefaults({ night: { start: "22:00", end: "06:00" } })).toEqual({ night: { start: "22:00", end: "06:00" } });
  });

  it("isMissingSchemaError erkennt Codes und Meldungen", () => {
    expect(isMissingSchemaError({ code: "PGRST205" })).toBe(true);
    expect(isMissingSchemaError({ message: 'relation "public.shift_entries" does not exist' })).toBe(true);
    expect(isMissingSchemaError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});
