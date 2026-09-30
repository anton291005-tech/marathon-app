import { freezeTimeForTests } from "../../../core/time/timeSystem";
import { supabase } from "../client";
import {
  archiveTrainingPlan,
  insertNewTrainingPlan,
  loadAllTrainingPlans,
  loadArchivedTrainingPlans,
  MAX_ACTIVE_PLANS,
  restoreArchivedTrainingPlan,
} from "./trainingPlanService";

jest.mock("../client", () => ({
  supabase: { from: jest.fn() },
}));

const USER_ID = "user-1";

type Result = { data?: unknown; error: unknown };

/** Verkettbare Query: jede Methode protokolliert und gibt sich selbst zurück; await → `result`. */
function query(result: Result, single: Result = result) {
  const q: Record<string, jest.Mock> & { calls: Array<[string, unknown[]]> } = { calls: [] } as never;
  for (const name of ["select", "update", "insert", "eq", "is", "not", "order", "limit"]) {
    q[name] = jest.fn((...args: unknown[]) => {
      q.calls.push([name, args]);
      return q;
    });
  }
  q.maybeSingle = jest.fn(async () => single);
  q.then = jest.fn((resolve: (v: Result) => unknown) => resolve(result));
  return q;
}

afterEach(() => freezeTimeForTests(null));

describe("trainingPlanService — Archiv (Migration 012)", () => {
  it("MAX_ACTIVE_PLANS bleibt 5", () => {
    expect(MAX_ACTIVE_PLANS).toBe(5);
  });

  it("die Planliste enthält nur nicht archivierte Pläne", async () => {
    const q = query({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue(q);
    await loadAllTrainingPlans(USER_ID);
    expect(q.calls).toContainEqual(["is", ["archived_at", null]]);
  });

  it("das Archiv lädt nur archivierte Pläne, neueste zuerst", async () => {
    const q = query({ data: [{ id: "p1", archived_at: "2026-10-01T08:00:00Z", plan_slot: null }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(q);
    const list = await loadArchivedTrainingPlans(USER_ID);
    expect(q.calls).toContainEqual(["not", ["archived_at", "is", null]]);
    expect(q.calls).toContainEqual(["order", ["archived_at", { ascending: false }]]);
    expect(list).toHaveLength(1);
  });

  it("archiviert statt zu löschen: archived_at setzen, Slot freigeben, deaktivieren", async () => {
    freezeTimeForTests(new Date("2026-10-01T08:00:00Z"));
    const load = query(
      { error: null },
      { data: { id: "p1", plan_slot: 2, is_active: true, archived_at: null }, error: null },
    );
    const write = query({ error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(load).mockReturnValueOnce(write);

    const previous = await archiveTrainingPlan(USER_ID, "p1");

    expect(previous).toEqual({ slot: 2, wasActive: true });
    expect(write.update).toHaveBeenCalledWith({
      archived_at: "2026-10-01T08:00:00.000Z",
      plan_slot: null,
      is_active: false,
    });
    expect(write.calls).toContainEqual(["eq", ["user_id", USER_ID]]);
    expect(write.calls).toContainEqual(["is", ["archived_at", null]]);
    expect(write.delete).toBeUndefined();
  });

  it("ein bereits archivierter Plan bleibt unangetastet", async () => {
    const load = query(
      { error: null },
      { data: { id: "p1", plan_slot: null, is_active: false, archived_at: "2026-10-01T08:00:00Z" }, error: null },
    );
    (supabase.from as jest.Mock).mockReturnValueOnce(load);
    expect(await archiveTrainingPlan(USER_ID, "p1")).toBeNull();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("wirft, wenn der Plan fehlt oder das Schreiben scheitert", async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(query({ error: null }, { data: null, error: null }));
    await expect(archiveTrainingPlan(USER_ID, "p1")).rejects.toThrow();

    const load = query({ error: null }, { data: { id: "p1", plan_slot: 1, is_active: true, archived_at: null }, error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(load).mockReturnValueOnce(query({ error: { message: "boom" } }));
    await expect(archiveTrainingPlan(USER_ID, "p1")).rejects.toEqual({ message: "boom" });
  });

  it("Wiederherstellen setzt Slot und Aktiv-Status exakt zurück", async () => {
    const deactivate = query({ error: null });
    const restore = query({ error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(deactivate).mockReturnValueOnce(restore);

    await restoreArchivedTrainingPlan(USER_ID, "p1", { slot: 2, wasActive: true });

    expect(deactivate.update).toHaveBeenCalledWith({ is_active: false });
    expect(restore.update).toHaveBeenCalledWith({ archived_at: null, plan_slot: 2, is_active: true });
    expect(restore.calls).toContainEqual(["eq", ["id", "p1"]]);
  });

  it("vor Migration 012: Planliste fällt auf die alte Abfrage zurück (nichts wird leer)", async () => {
    const failing = query({ data: null, error: { code: "42703", message: 'column training_plans.archived_at does not exist' } });
    const legacy = query({ data: [{ id: "p1", plan_slot: 1, plan_name: "Warschau", is_active: true, created_at: "x" }], error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(failing).mockReturnValueOnce(legacy);
    const list = await loadAllTrainingPlans(USER_ID);
    expect(list).toEqual([{ id: "p1", plan_slot: 1, plan_name: "Warschau", is_active: true, created_at: "x", archived_at: null }]);
    expect(legacy.calls.some(([name]) => name === "is")).toBe(false);
  });

  it("neuer Plan belegt den ersten Slot ohne Plan — archivierte (Slot NULL) zählen nicht", async () => {
    const slots = query({ data: [{ plan_slot: 2 }, { plan_slot: 3 }], error: null });
    const deactivate = query({ error: null });
    const insert = query({ error: null });
    (supabase.from as jest.Mock).mockReturnValueOnce(slots).mockReturnValueOnce(deactivate).mockReturnValueOnce(insert);

    await insertNewTrainingPlan(USER_ID, { version: 2, weeks: [], workouts: [] } as never, "Berlin");

    // Filter über plan_slot statt archived_at: funktioniert auch vor Migration 012.
    expect(slots.calls).toContainEqual(["not", ["plan_slot", "is", null]]);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ plan_slot: 1, plan_name: "Berlin", is_active: true }));
  });
});
