jest.mock("../client", () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from "../client";
import type { PrepRecapRecord } from "../../../prepRecap/prepRecapRecord";
import {
  dbRowToPrepRecap,
  insertPrepRecapIfAbsent,
  linkPrepRecapToPlan,
  prepRecapToInsertPayload,
  updatePrepRecapFinishTime,
  type DbPrepRecapRow,
} from "./prepRecapService";

const USER_ID = "user-1";

const row: DbPrepRecapRow = {
  id: "row-1",
  user_id: USER_ID,
  plan_id: null,
  race_name: "Warschau Marathon",
  race_date: "2026-09-27",
  finish_time_seconds: 11637,
  finish_time_source: "health",
  finish_time_confirmed: false,
  schema_version: 1,
  stats: { schemaVersion: 1 },
  created_at: "2026-09-30T10:00:00Z",
  updated_at: "2026-09-30T10:00:00Z",
};

beforeEach(() => jest.clearAllMocks());

describe("Mapping", () => {
  it("mappt eine DB-Zeile", () => {
    expect(dbRowToPrepRecap(row)).toMatchObject({
      id: "row-1",
      planId: null,
      raceDate: "2026-09-27",
      finishTimeSeconds: 11637,
      finishTimeSource: "health",
      finishTimeConfirmed: false,
      schemaVersion: 1,
    });
  });

  it("verwirft Zeilen ohne Stats und bereinigt inkonsistente Zeitfelder", () => {
    expect(dbRowToPrepRecap({ ...row, stats: null })).toBeNull();
    expect(
      dbRowToPrepRecap({ ...row, finish_time_seconds: null, finish_time_source: "health", finish_time_confirmed: true }),
    ).toMatchObject({ finishTimeSeconds: null, finishTimeSource: null, finishTimeConfirmed: false });
  });

  it("schreibt ohne Zeit weder Quelle noch Bestätigung", () => {
    const record = dbRowToPrepRecap(row) as PrepRecapRecord;
    const payload = prepRecapToInsertPayload(USER_ID, {
      ...record,
      finishTimeSeconds: null,
      finishTimeSource: "health",
      finishTimeConfirmed: true,
    });
    expect(payload).toMatchObject({ finish_time_seconds: null, finish_time_source: null, finish_time_confirmed: false });
  });
});

describe("insertPrepRecapIfAbsent", () => {
  it("upsertet mit ignoreDuplicates auf (user_id, race_date) und liest die gespeicherte Zeile zurück", async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    const maybeSingle = jest.fn(async () => ({ data: row, error: null }));
    const eqDate = jest.fn(() => ({ maybeSingle }));
    const eqUser = jest.fn(() => ({ eq: eqDate }));
    const select = jest.fn(() => ({ eq: eqUser }));
    (supabase.from as jest.Mock).mockReturnValue({ upsert, select });

    const result = await insertPrepRecapIfAbsent(USER_ID, dbRowToPrepRecap(row) as PrepRecapRecord);

    expect(supabase.from).toHaveBeenCalledWith("prep_recaps");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER_ID, race_date: "2026-09-27" }), {
      onConflict: "user_id,race_date",
      ignoreDuplicates: true,
    });
    expect(eqDate).toHaveBeenCalledWith("race_date", "2026-09-27");
    expect(result?.id).toBe("row-1");
  });

  it("liefert null, wenn das Schreiben scheitert (z. B. Tabelle fehlt)", async () => {
    (supabase.from as jest.Mock).mockReturnValue({ upsert: jest.fn(async () => ({ error: { message: "relation does not exist" } })) });
    expect(await insertPrepRecapIfAbsent(USER_ID, dbRowToPrepRecap(row) as PrepRecapRecord)).toBeNull();
  });
});

describe("updatePrepRecapFinishTime", () => {
  function setup() {
    const is = jest.fn(async () => ({ error: null }));
    const query: Record<string, jest.Mock> = {};
    query.eq = jest.fn(() => query);
    query.is = is;
    query.then = jest.fn((resolve: (v: unknown) => unknown) => resolve({ error: null }));
    const update = jest.fn(() => query);
    (supabase.from as jest.Mock).mockReturnValue({ update });
    return { update, query, is };
  }

  it("filtert den Health-Nachtrag auf leere Zeit (nie überschreiben)", async () => {
    const { update, is } = setup();
    await updatePrepRecapFinishTime(USER_ID, "2026-09-27", { seconds: 11637, source: "health", confirmed: false }, { onlyIfEmpty: true });
    expect(update).toHaveBeenCalledWith({ finish_time_seconds: 11637, finish_time_source: "health", finish_time_confirmed: false });
    expect(is).toHaveBeenCalledWith("finish_time_seconds", null);
  });

  it("überschreibt bei Nutzereingabe ohne Filter", async () => {
    const { is } = setup();
    await updatePrepRecapFinishTime(USER_ID, "2026-09-27", { seconds: 11590, source: "manual", confirmed: true });
    expect(is).not.toHaveBeenCalled();
  });
});

describe("linkPrepRecapToPlan", () => {
  function setup(result: { data: unknown; error: unknown }) {
    const query: Record<string, jest.Mock> = {};
    query.eq = jest.fn(() => query);
    query.select = jest.fn(async () => result);
    const update = jest.fn(() => query);
    (supabase.from as jest.Mock).mockReturnValue({ update });
    return { update, query };
  }

  it("setzt plan_id für den Renntag und meldet eine geänderte Zeile", async () => {
    const { update, query } = setup({ data: [{ id: "row-1" }], error: null });
    expect(await linkPrepRecapToPlan(USER_ID, "2026-09-27", "plan-1")).toBe(true);
    expect(update).toHaveBeenCalledWith({ plan_id: "plan-1" });
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(query.eq).toHaveBeenCalledWith("race_date", "2026-09-27");
  });

  it("Update ohne Treffer oder mit Fehler gilt als nicht verknüpft (Flow bricht ab)", async () => {
    setup({ data: [], error: null });
    expect(await linkPrepRecapToPlan(USER_ID, "2026-09-27", "plan-1")).toBe(false);
    setup({ data: null, error: { message: "boom" } });
    expect(await linkPrepRecapToPlan(USER_ID, "2026-09-27", "plan-1")).toBe(false);
  });
});
