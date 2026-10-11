import { ACCOUNT_DELETE_FAILED_MESSAGE, runAccountDeletion, runSignOut } from "./accountActions";

function makeDeps() {
  const calls: string[] = [];
  return {
    calls,
    deleteAccount: jest.fn(async () => {
      calls.push("deleteAccount");
    }),
    cancelReminders: jest.fn(async () => {
      calls.push("cancelReminders");
    }),
    clearLocalData: jest.fn(() => {
      calls.push("clearLocalData");
    }),
    signOut: jest.fn(async () => {
      calls.push("signOut");
    }),
  };
}

let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  error = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

describe("runSignOut", () => {
  test("bestellt die Erinnerung ab, bevor abgemeldet wird", async () => {
    const deps = makeDeps();
    await runSignOut(deps);
    expect(deps.calls).toEqual(["cancelReminders", "clearLocalData", "signOut"]);
  });

  test("meldet auch ab, wenn das Abbestellen scheitert", async () => {
    const deps = makeDeps();
    deps.cancelReminders.mockRejectedValueOnce(new Error("plugin"));
    await runSignOut(deps);
    expect(deps.clearLocalData).toHaveBeenCalledTimes(1);
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("runAccountDeletion", () => {
  test("Erfolg: löschen → Erinnerung abbestellen → lokale Daten → abmelden", async () => {
    const deps = makeDeps();
    await expect(runAccountDeletion(deps)).resolves.toEqual({ ok: true });
    expect(deps.calls).toEqual(["deleteAccount", "cancelReminders", "clearLocalData", "signOut"]);
  });

  test("Fehler beim Löschen: KEIN signOut, nichts lokal gelöscht, Erinnerung bleibt, Meldung fürs Dialogfeld", async () => {
    const deps = makeDeps();
    deps.deleteAccount.mockRejectedValueOnce(new Error("Failed to delete auth user"));
    await expect(runAccountDeletion(deps)).resolves.toEqual({ ok: false, message: ACCOUNT_DELETE_FAILED_MESSAGE });
    expect(deps.signOut).not.toHaveBeenCalled();
    expect(deps.clearLocalData).not.toHaveBeenCalled();
    expect(deps.cancelReminders).not.toHaveBeenCalled();
  });

  test("erneuter Versuch nach einem Fehler läuft vollständig durch", async () => {
    const deps = makeDeps();
    deps.deleteAccount.mockRejectedValueOnce(new Error("offline"));
    expect((await runAccountDeletion(deps)).ok).toBe(false);
    expect((await runAccountDeletion(deps)).ok).toBe(true);
    expect(deps.deleteAccount).toHaveBeenCalledTimes(2);
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });

  test("scheitert nur das Abmelden nach erfolgreichem Löschen, gilt das Löschen trotzdem als erfolgt", async () => {
    const deps = makeDeps();
    deps.signOut.mockRejectedValueOnce(new Error("user gone"));
    await expect(runAccountDeletion(deps)).resolves.toEqual({ ok: true });
    expect(deps.clearLocalData).toHaveBeenCalledTimes(1);
  });

  test("scheitert das Abbestellen, wird trotzdem abgemeldet", async () => {
    const deps = makeDeps();
    deps.cancelReminders.mockRejectedValueOnce(new Error("plugin"));
    await expect(runAccountDeletion(deps)).resolves.toEqual({ ok: true });
    expect(deps.signOut).toHaveBeenCalledTimes(1);
  });
});
