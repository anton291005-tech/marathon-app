import type { OneOffScheduleBlock, RecurringScheduleBlock } from "./weeklyScheduleBlocksService";

jest.mock("../client", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "../client";
import { insertPresetBlocks, replaceAllEventkitBlocks } from "./weeklyScheduleBlocksService";

const USER_ID = "user-1";

type MockResult = { error: { message: string } | null };

function setupFromMock(deleteResult: MockResult, insertResult: MockResult) {
  const insertMock = jest.fn(async (_rows: unknown[]) => insertResult);
  const eqSource = jest.fn(async (_col: string, _val: string) => deleteResult);
  const eqUser = jest.fn((_col: string, _val: string) => ({ eq: eqSource }));
  const deleteMock = jest.fn(() => ({ eq: eqUser }));

  (supabase.from as jest.Mock).mockReturnValue({ delete: deleteMock, insert: insertMock });
  return { deleteMock, eqUser, eqSource, insertMock };
}

function eventkitBlock(overrides: Partial<OneOffScheduleBlock> = {}): OneOffScheduleBlock {
  return {
    id: "ek-1",
    title: "Vorlesung",
    category: "study",
    startTime: "10:00",
    endTime: "12:00",
    notes: null,
    source: "eventkit",
    isRecurring: false,
    specificDate: "2026-08-25",
    ...overrides,
  };
}

function presetBlock(overrides: Partial<RecurringScheduleBlock> = {}): RecurringScheduleBlock {
  return {
    id: "pr-1",
    title: "Vollzeit-Job",
    category: "job",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    source: "preset",
    isRecurring: true,
    dayOfWeek: 1,
    recurrenceStartDate: "2026-08-24",
    recurrenceEndDate: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("replaceAllEventkitBlocks", () => {
  it("löscht per user_id+source='eventkit' und insertet die neuen Zeilen", async () => {
    const { eqUser, eqSource, insertMock } = setupFromMock({ error: null }, { error: null });

    const result = await replaceAllEventkitBlocks(USER_ID, [eventkitBlock(), eventkitBlock({ id: "ek-2" })]);

    expect(result).toEqual({ ok: true, insertedCount: 2 });
    expect(eqUser).toHaveBeenCalledWith("user_id", USER_ID);
    expect(eqSource).toHaveBeenCalledWith("source", "eventkit");
    expect(insertMock).toHaveBeenCalledTimes(1);
    const rows = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: USER_ID, source: "eventkit", specific_date: "2026-08-25" });
  });

  it("filtert Blöcke mit fremder source heraus (schützt vor versehentlichem Fremd-Insert)", async () => {
    const { insertMock } = setupFromMock({ error: null }, { error: null });

    const result = await replaceAllEventkitBlocks(USER_ID, [
      eventkitBlock(),
      eventkitBlock({ id: "wrong", source: "manual" }),
    ]);

    expect(result).toEqual({ ok: true, insertedCount: 1 });
    expect(insertMock.mock.calls[0][0]).toHaveLength(1);
  });

  it("leere Liste: Delete läuft (Kalender geleert), kein Insert", async () => {
    const { deleteMock, insertMock } = setupFromMock({ error: null }, { error: null });

    const result = await replaceAllEventkitBlocks(USER_ID, []);

    expect(result).toEqual({ ok: true, insertedCount: 0 });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("bricht bei Delete-Fehler ab ohne Insert und meldet ok=false", async () => {
    const { insertMock } = setupFromMock({ error: { message: "boom" } }, { error: null });

    const result = await replaceAllEventkitBlocks(USER_ID, [eventkitBlock()]);

    expect(result).toEqual({ ok: false, insertedCount: 0 });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("meldet ok=false bei Insert-Fehler", async () => {
    const result = (() => {
      setupFromMock({ error: null }, { error: { message: "boom" } });
      return replaceAllEventkitBlocks(USER_ID, [eventkitBlock()]);
    })();

    await expect(result).resolves.toEqual({ ok: false, insertedCount: 0 });
  });
});

describe("insertPresetBlocks", () => {
  it("löscht bestehende 'preset'-Zeilen (idempotenter Preset-Wechsel) und insertet recurring Zeilen", async () => {
    const { eqUser, eqSource, insertMock } = setupFromMock({ error: null }, { error: null });

    const result = await insertPresetBlocks(USER_ID, [presetBlock(), presetBlock({ id: "pr-2", dayOfWeek: 2 })]);

    expect(result).toEqual({ ok: true, insertedCount: 2 });
    expect(eqUser).toHaveBeenCalledWith("user_id", USER_ID);
    expect(eqSource).toHaveBeenCalledWith("source", "preset");
    const rows = insertMock.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ user_id: USER_ID, source: "preset", is_recurring: true, day_of_week: 1 });
  });

  it("rührt 'eventkit'-Blöcke nicht an (Filter auf source='preset')", async () => {
    const { insertMock } = setupFromMock({ error: null }, { error: null });

    const result = await insertPresetBlocks(USER_ID, [presetBlock(), eventkitBlock()]);

    expect(result).toEqual({ ok: true, insertedCount: 1 });
    expect(insertMock.mock.calls[0][0]).toHaveLength(1);
  });
});
