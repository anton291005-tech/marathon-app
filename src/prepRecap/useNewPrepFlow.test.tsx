import { act, renderHook } from "@testing-library/react";
import { fullRecapStats } from "../components/prepRecap/recapTestFixtures";
import { NEW_PREP_NO_PLAN_MESSAGE, NEW_PREP_SNAPSHOT_FAILED_MESSAGE } from "./newPrepFlow";
import type { PrepRecapRecord } from "./prepRecapRecord";
import { useNewPrepFlow, type NewPrepFlowDeps } from "./useNewPrepFlow";

const PLAN_ID = "plan-warschau";

function storedRecord(overrides: Partial<PrepRecapRecord> = {}): PrepRecapRecord {
  return {
    id: "recap-1",
    planId: PLAN_ID,
    raceName: "Warschau Marathon",
    raceDate: "2026-09-27",
    finishTimeSeconds: 11637,
    finishTimeSource: "health",
    finishTimeConfirmed: true,
    schemaVersion: 1,
    stats: fullRecapStats(),
    ...overrides,
  };
}

/** Protokolliert die Reihenfolge aller Seiteneffekte. */
function setup(overrides: Partial<NewPrepFlowDeps> = {}) {
  const calls: string[] = [];
  const deps: NewPrepFlowDeps = {
    getPlanIdToArchive: () => PLAN_ID,
    ensureSnapshot: jest.fn(async () => {
      calls.push("ensureSnapshot");
      return storedRecord();
    }),
    linkSnapshotToPlan: jest.fn(async () => {
      calls.push("link");
      return true;
    }),
    archivePlan: jest.fn(async () => {
      calls.push("archive");
      return { slot: 1, wasActive: true };
    }),
    restorePlan: jest.fn(async () => {
      calls.push("restore");
    }),
    ...overrides,
  };
  const insertNewPlan = jest.fn(async () => {
    calls.push("insert");
  });
  const { result } = renderHook(() => useNewPrepFlow(deps));
  return { calls, deps, insertNewPlan, flow: result };
}

describe("useNewPrepFlow — Neue Vorbereitung starten", () => {
  it("Erfolg: Snapshot → Merker/Wizard → erst beim Abschluss archivieren, dann neuen Plan anlegen", async () => {
    const { calls, deps, insertNewPlan, flow } = setup();

    await act(() => flow.current.start());
    expect(flow.current.wizardOpen).toBe(true);
    expect(flow.current.pending).toEqual({ planIdToArchive: PLAN_ID, raceDate: "2026-09-27" });
    expect(flow.current.error).toBeNull();
    // Vor dem Abschluss wurde nichts archiviert.
    expect(deps.archivePlan).not.toHaveBeenCalled();
    expect(deps.linkSnapshotToPlan).not.toHaveBeenCalled();

    await act(() => flow.current.complete(insertNewPlan));
    expect(calls).toEqual(["ensureSnapshot", "archive", "insert"]);
    expect(deps.archivePlan).toHaveBeenCalledWith(PLAN_ID);
    expect(deps.restorePlan).not.toHaveBeenCalled();
    expect(flow.current.wizardOpen).toBe(false);
    expect(flow.current.pending).toBeNull();
  });

  it("Snapshot-Fehler: Abbruch mit Meldung, kein Merker, kein Wizard, nichts archiviert", async () => {
    const { deps, insertNewPlan, flow } = setup({
      ensureSnapshot: jest.fn(async () => {
        throw new Error("network");
      }),
    });

    await act(() => flow.current.start());
    expect(flow.current.wizardOpen).toBe(false);
    expect(flow.current.pending).toBeNull();
    expect(flow.current.error).toBe(NEW_PREP_SNAPSHOT_FAILED_MESSAGE);
    expect(deps.archivePlan).not.toHaveBeenCalled();
    expect(insertNewPlan).not.toHaveBeenCalled();
  });

  it("Snapshot nur lokal (offline, ohne id): gilt als Fehler, nichts archiviert", async () => {
    const { deps, flow } = setup({ ensureSnapshot: jest.fn(async () => storedRecord({ id: undefined })) });
    await act(() => flow.current.start());
    expect(flow.current.wizardOpen).toBe(false);
    expect(flow.current.error).toBe(NEW_PREP_SNAPSHOT_FAILED_MESSAGE);
    expect(deps.archivePlan).not.toHaveBeenCalled();
  });

  it("Snapshot ohne Plan-Bezug wird vor dem Wizard verknüpft; scheitert das, Abbruch", async () => {
    const ok = setup({ ensureSnapshot: jest.fn(async () => storedRecord({ planId: null })) });
    await act(() => ok.flow.current.start());
    expect(ok.deps.linkSnapshotToPlan).toHaveBeenCalledWith("2026-09-27", PLAN_ID);
    expect(ok.flow.current.wizardOpen).toBe(true);

    const failing = setup({
      ensureSnapshot: jest.fn(async () => storedRecord({ planId: null })),
      linkSnapshotToPlan: jest.fn(async () => false),
    });
    await act(() => failing.flow.current.start());
    expect(failing.flow.current.wizardOpen).toBe(false);
    expect(failing.flow.current.error).toBe(NEW_PREP_SNAPSHOT_FAILED_MESSAGE);
  });

  it("ohne aktiven Plan: Abbruch, Snapshot wird gar nicht erst angefasst", async () => {
    const { deps, flow } = setup({ getPlanIdToArchive: () => null });
    await act(() => flow.current.start());
    expect(deps.ensureSnapshot).not.toHaveBeenCalled();
    expect(flow.current.wizardOpen).toBe(false);
    expect(flow.current.error).toBe(NEW_PREP_NO_PLAN_MESSAGE);
  });

  it("Abbruch im Wizard: Merker zurückgesetzt, nichts archiviert, nichts angelegt", async () => {
    const { deps, insertNewPlan, flow } = setup();

    await act(() => flow.current.start());
    expect(flow.current.wizardOpen).toBe(true);

    act(() => flow.current.cancel());
    expect(flow.current.wizardOpen).toBe(false);
    expect(flow.current.pending).toBeNull();
    expect(flow.current.pendingRef.current).toBeNull();
    expect(deps.archivePlan).not.toHaveBeenCalled();
    expect(deps.restorePlan).not.toHaveBeenCalled();
    expect(insertNewPlan).not.toHaveBeenCalled();

    // Ein späterer normaler „Neuer Trainingsplan" archiviert nichts.
    await act(() => flow.current.complete(insertNewPlan));
    expect(deps.archivePlan).not.toHaveBeenCalled();
    expect(insertNewPlan).toHaveBeenCalledTimes(1);
  });

  it("neuer Plan scheitert: Archivierung wird zurückgenommen, Fehler geht an den Wizard, Merker bleibt", async () => {
    const { calls, deps, flow } = setup();
    await act(() => flow.current.start());

    const failingInsert = jest.fn(async () => {
      calls.push("insert");
      throw new Error("insert failed");
    });
    await act(async () => {
      await expect(flow.current.complete(failingInsert)).rejects.toThrow("insert failed");
    });
    expect(calls).toEqual(["ensureSnapshot", "archive", "insert", "restore"]);
    expect(deps.restorePlan).toHaveBeenCalledWith(PLAN_ID, { slot: 1, wasActive: true });
    // Wizard bleibt offen (erneut versuchen archiviert wieder) — Abbrechen setzt den Merker zurück.
    expect(flow.current.wizardOpen).toBe(true);
  });

  it("bereits archiviert (Wiederholung): nichts wiederherzustellen, wenn das Anlegen erneut scheitert", async () => {
    const { deps, flow } = setup({ archivePlan: jest.fn(async () => null) });
    await act(() => flow.current.start());
    await act(async () => {
      await expect(
        flow.current.complete(async () => {
          throw new Error("insert failed");
        }),
      ).rejects.toThrow();
    });
    expect(deps.restorePlan).not.toHaveBeenCalled();
  });

  it("Doppel-Tap startet den Snapshot nur einmal", async () => {
    const { deps, flow } = setup();
    await act(async () => {
      await Promise.all([flow.current.start(), flow.current.start()]);
    });
    expect(deps.ensureSnapshot).toHaveBeenCalledTimes(1);
  });
});
