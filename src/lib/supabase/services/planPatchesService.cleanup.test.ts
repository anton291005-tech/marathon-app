import fs from "fs";
import path from "path";
import { supabase } from "../client";
import { clearPlanPatchesForPlanChange, deleteAllPlanPatches, PLAN_PATCHES_DELETE_TIMEOUT_MS } from "./planPatchesService";

// Von babel-jest vor die Imports gehoben.
jest.mock("../client", () => ({
  supabase: { from: jest.fn() },
}));

/**
 * `fix/plan-patches-cleanup`: `plan_patches` hat keinen Plan-Bezug. Wird ein anderer Plan aktiv, müssen die
 * Patches lokal UND in Supabase weg, sonst wirken alte Zeilen über die Session-ID (`w5-mo`) auf den neuen Plan.
 */

const USER_ID = "user-1";

function mockDelete(result: { error: { message: string } | null } | Error) {
  const eqUser = jest.fn(async (_col: string, _val: string) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const deleteMock = jest.fn(() => ({ eq: eqUser }));
  (supabase.from as jest.Mock).mockReturnValue({ delete: deleteMock });
  return { deleteMock, eqUser };
}

describe("deleteAllPlanPatches", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("löscht alle Zeilen des Nutzers: DELETE auf plan_patches, einziger Filter ist user_id", async () => {
    const { deleteMock, eqUser } = mockDelete({ error: null });

    await expect(deleteAllPlanPatches(USER_ID)).resolves.toBe(true);

    expect(supabase.from).toHaveBeenCalledWith("plan_patches");
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(eqUser.mock.calls).toEqual([["user_id", USER_ID]]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("Fehlerantwort von Supabase: Warnung, kein Throw, false", async () => {
    mockDelete({ error: { message: "permission denied" } });

    await expect(deleteAllPlanPatches(USER_ID)).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledWith("[planPatchesService] deleteAllPlanPatches", "permission denied");
  });

  test("Netzwerkfehler (offline, fetch wirft): Warnung, kein Throw, false", async () => {
    mockDelete(new Error("Failed to fetch"));

    await expect(deleteAllPlanPatches(USER_ID)).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("clearPlanPatchesForPlanChange", () => {
  test("Planwechsel: erst lokal leeren, dann DELETE für den Nutzer", async () => {
    const events: string[] = [];
    const deleteRemote = jest.fn(async (_userId: string) => {
      events.push("delete");
      return true;
    });

    await clearPlanPatchesForPlanChange({
      activePlanChanged: true,
      userId: USER_ID,
      clearLocal: () => events.push("clearLocal"),
      deleteRemote,
    });

    expect(events).toEqual(["clearLocal", "delete"]);
    expect(deleteRemote).toHaveBeenCalledWith(USER_ID);
  });

  test("Onboarding-Reihenfolge: neue Patches werden erst gespeichert, wenn der DELETE durch ist", async () => {
    const events: string[] = [];
    let finishDelete: (ok: boolean) => void = () => {};
    const deleteRemote = jest.fn(
      (_userId: string) =>
        new Promise<boolean>((resolve) => {
          events.push("delete gestartet");
          finishDelete = (ok) => {
            events.push("delete fertig");
            resolve(ok);
          };
        }),
    );

    // Wie in `handleOnboardingComplete`: DELETE sofort starten, vor dem Speichern der Wizard-Patches darauf warten.
    const patchesCleared = clearPlanPatchesForPlanChange({
      activePlanChanged: true,
      userId: USER_ID,
      clearLocal: () => events.push("clearLocal"),
      deleteRemote,
    });
    const wizard = patchesCleared.then(() => events.push("Wizard-Patches gespeichert"));

    await Promise.resolve();
    expect(events).toEqual(["clearLocal", "delete gestartet"]);

    finishDelete(true);
    await wizard;
    expect(events).toEqual(["clearLocal", "delete gestartet", "delete fertig", "Wizard-Patches gespeichert"]);
  });

  test("kein Planwechsel (nicht aktiver Plan gelöscht): weder lokal leeren noch DELETE", async () => {
    const clearLocal = jest.fn();
    const deleteRemote = jest.fn(async () => true);

    await clearPlanPatchesForPlanChange({ activePlanChanged: false, userId: USER_ID, clearLocal, deleteRemote });

    expect(clearLocal).not.toHaveBeenCalled();
    expect(deleteRemote).not.toHaveBeenCalled();
  });

  test("ohne Anmeldung: nur lokal leeren", async () => {
    const clearLocal = jest.fn();
    const deleteRemote = jest.fn(async () => true);

    await clearPlanPatchesForPlanChange({ activePlanChanged: true, userId: null, clearLocal, deleteRemote });

    expect(clearLocal).toHaveBeenCalledTimes(1);
    expect(deleteRemote).not.toHaveBeenCalled();
  });

  test("DELETE schlägt fehl: lokal ist geleert, das Promise erfüllt sich trotzdem (kein Throw)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (supabase.from as jest.Mock).mockReset();
    mockDelete(new Error("Failed to fetch"));
    const clearLocal = jest.fn();

    // Ohne `deleteRemote`: der echte `deleteAllPlanPatches` läuft gegen den gemockten Client.
    await expect(clearPlanPatchesForPlanChange({ activePlanChanged: true, userId: USER_ID, clearLocal })).resolves.toBeUndefined();

    expect(clearLocal).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("clearPlanPatchesForPlanChange – Timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ein DELETE, der nie antwortet, blockiert den Ablauf höchstens bis zum Limit: Warnung, kein Throw", async () => {
    jest.useFakeTimers();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const deleteRemote = jest.fn((_userId: string) => new Promise<boolean>(() => {}));
    let settled = false;

    const pending = clearPlanPatchesForPlanChange({
      activePlanChanged: true,
      userId: USER_ID,
      clearLocal: jest.fn(),
      deleteRemote,
    }).then(() => {
      settled = true;
    });

    const flushMicrotasks = async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    };

    jest.advanceTimersByTime(PLAN_PATCHES_DELETE_TIMEOUT_MS - 1);
    await flushMicrotasks();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await pending;
    expect(settled).toBe(true);
    expect(deleteRemote).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(PLAN_PATCHES_DELETE_TIMEOUT_MS).toBe(5000);
    warnSpy.mockRestore();
  });
});

/**
 * Verdrahtung in `AppMain.tsx`: Die Handler brauchen Login und haben keinen Render-Test, deshalb hier nur
 * Quelltext-Checks (gleiches Muster wie `workoutCardFixes.verification.test.tsx`).
 */
describe("AppMain.tsx ruft die Bereinigung an allen Planwechsel-Stellen auf", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../../AppMain.tsx"), "utf8");

  function handlerBody(name: string, nextName: string): string {
    const start = source.indexOf(`const ${name} = `);
    const end = source.indexOf(`const ${nextName} = `, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  test("Onboarding-Abschluss: DELETE wird gestartet und VOR dem Speichern der Wizard-Patches abgewartet", () => {
    const start = source.indexOf("const handleOnboardingComplete = ");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start);
    const cleared = body.indexOf("clearPlanPatchesForPlanChange({ activePlanChanged: true");
    const awaited = body.indexOf("await patchesCleared;");
    const wizardPatches = body.indexOf('handleAiApplyPlanPatches("", null, patches);');
    expect(cleared).toBeGreaterThan(-1);
    expect(awaited).toBeGreaterThan(cleared);
    expect(wizardPatches).toBeGreaterThan(awaited);
  });

  test("Planwechsel: Bereinigung nach dem Umschalten des aktiven Plans", () => {
    const body = handlerBody("handleSwitchPlan", "handleAddNewPlan");
    const switched = body.indexOf("await setActivePlan(user.id, planId);");
    const cleared = body.indexOf("clearPlanPatchesForPlanChange({ activePlanChanged: true, userId: user.id");
    expect(switched).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(switched);
    expect(body).toContain("await patchesCleared;");
  });

  test("Plan löschen: Bereinigung nur, wenn dadurch ein anderer Plan aktiv wurde", () => {
    const body = handlerBody("handleDeletePlan", "handleAccountDeleteCancel");
    expect(body).toContain("clearPlanPatchesForPlanChange({ activePlanChanged: !!activatedPlanId, userId: user.id");
    expect(body).not.toContain("activePlanChanged: true");
    expect(body).toContain("await patchesCleared;");
  });
});
