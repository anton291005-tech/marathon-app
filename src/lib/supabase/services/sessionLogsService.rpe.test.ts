// Session-RPE und Dauer (Migration 016): Mapping und Rückfall, solange die Migration fehlt.
jest.mock("../client", () => ({ supabase: { from: jest.fn() } }));

import { supabase } from "../client";
import { normalizeRpe, sessionDurationMin, upsertSessionLogWithResult } from "./sessionLogsService";

const from = supabase.from as jest.Mock;

function mockUpsertSequence(results: Array<{ error: unknown }>) {
  const upsert = jest.fn();
  results.forEach((result) => upsert.mockResolvedValueOnce({ data: null, ...result }));
  from.mockReturnValue({ upsert });
  return upsert;
}

beforeEach(() => jest.clearAllMocks());

describe("normalizeRpe", () => {
  it.each([
    [0, 0],
    [7, 7],
    [10, 10],
    [6.6, 7],
    ["4", 4],
  ])("%p → %p", (input, expected) => expect(normalizeRpe(input)).toBe(expected));

  it.each([-1, 11, NaN, null, undefined, "x"])("%p → null", (input) => expect(normalizeRpe(input)).toBeNull());
});

describe("sessionDurationMin", () => {
  it("nimmt zuerst den zugeordneten Health-Lauf (Sekunden), sonst eine eingetragene Dauer", () => {
    expect(sessionDurationMin({ assignedRun: { runId: "r", startDate: "x", duration: 3000, distanceKm: 10 } })).toBe(50);
    expect(sessionDurationMin({ durationMin: 48 })).toBe(48);
    expect(sessionDurationMin({ durationMin: 48, assignedRun: { runId: "r", startDate: "x", duration: 3000, distanceKm: 10 } })).toBe(50);
    expect(sessionDurationMin({})).toBeNull();
  });

  it("gelöster Lauf: keine alte Dauer mehr (duration_min wird nicht ins lokale Log geladen)", () => {
    expect(sessionDurationMin({ done: true })).toBeNull();
  });

  it("verwirft Werte außerhalb 5–600 min", () => {
    expect(sessionDurationMin({ durationMin: 3 })).toBeNull();
    expect(sessionDurationMin({ durationMin: 700 })).toBeNull();
  });
});

describe("upsertSessionLogWithResult", () => {
  it("schreibt rpe und duration_min mit", async () => {
    const upsert = mockUpsertSequence([{ error: null }]);
    const result = await upsertSessionLogWithResult("u", "s1", { done: true, rpe: 6, durationMin: 45 });
    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ rpe: 6, duration_min: 45, completed: true });
  });

  it("ohne Migration 016: zweiter Versuch ohne die neuen Spalten, Abhaken klappt", async () => {
    const upsert = mockUpsertSequence([
      { error: { code: "PGRST204", message: "Could not find the 'duration_min' column of 'session_logs' in the schema cache" } },
      { error: null },
    ]);
    const result = await upsertSessionLogWithResult("u", "s1", { done: true, rpe: 6 });
    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0]).not.toHaveProperty("rpe");
    expect(upsert.mock.calls[1][0]).not.toHaveProperty("duration_min");
    expect(upsert.mock.calls[1][0]).toMatchObject({ completed: true, session_id: "s1" });
  });

  it("andere Fehler lösen keinen zweiten Versuch aus", async () => {
    const upsert = mockUpsertSequence([{ error: { code: "42501", message: "permission denied" } }]);
    const result = await upsertSessionLogWithResult("u", "s1", { done: true });
    expect(result.error).toMatchObject({ code: "42501" });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
