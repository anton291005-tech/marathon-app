import { runOnboardingCompletion } from "./newPrepFlow";

type Plan = { id: string; ok: boolean };

function setup(overrides: Partial<Parameters<typeof runOnboardingCompletion<Plan>>[0]> = {}) {
  const calls: string[] = [];
  const args = {
    newPrepPending: true,
    userId: "user-1",
    plan: { id: "new", ok: true } as Plan | null,
    isPlanUsable: (p: Plan) => p.ok,
    completeNewPrep: jest.fn(async (insert: () => Promise<void>) => {
      calls.push("archive");
      await insert();
    }),
    insertNewPlan: jest.fn(async () => {
      calls.push("insert");
    }),
    applyLocally: jest.fn(async ({ savedRemotely }: { savedRemotely: boolean }) => {
      calls.push(`local:${savedRemotely}`);
    }),
    ...overrides,
  };
  return { calls, args, run: () => runOnboardingCompletion<Plan>(args) };
}

describe("runOnboardingCompletion — remote vor lokal", () => {
  it("Neue Vorbereitung: erst archivieren + anlegen, dann lokal umstellen", async () => {
    const { calls, args, run } = setup();
    await run();
    expect(calls).toEqual(["archive", "insert", "local:true"]);
    expect(args.insertNewPlan).toHaveBeenCalledWith("user-1", { id: "new", ok: true });
  });

  it("Remote scheitert: wirft, lokal wird nichts angefasst", async () => {
    const { args, run } = setup({
      completeNewPrep: jest.fn(async () => {
        throw new Error("insert failed");
      }),
    });
    await expect(run()).rejects.toThrow("insert failed");
    expect(args.applyLocally).not.toHaveBeenCalled();
  });

  it.each([
    ["ungültiger Plan", { plan: { id: "bad", ok: false } }],
    ["kein Plan", { plan: null }],
    ["nicht angemeldet", { userId: null }],
  ])("%s: wirft vor dem Archivieren, lokal unverändert", async (_label, overrides) => {
    const { args, run } = setup(overrides as never);
    await expect(run()).rejects.toThrow(/nichts archiviert/);
    expect(args.completeNewPrep).not.toHaveBeenCalled();
    expect(args.applyLocally).not.toHaveBeenCalled();
  });

  it("ohne Merker (normaler neuer Plan): nie archivieren, erst remote anlegen, dann lokal umstellen", async () => {
    const { calls, args, run } = setup({ newPrepPending: false });
    await run();
    expect(args.completeNewPrep).not.toHaveBeenCalled();
    expect(calls).toEqual(["insert", "local:true"]);
  });

  it("ohne Merker, nicht angemeldet: nur lokal, kein Remote-Speichern", async () => {
    const { calls, args, run } = setup({ newPrepPending: false, userId: null });
    await run();
    expect(args.insertNewPlan).not.toHaveBeenCalled();
    expect(calls).toEqual(["local:false"]);
  });

  it.each([
    ["kein Plan", { plan: null }],
    ["ungültiger Plan", { plan: { id: "bad", ok: false } }],
  ])("ohne Merker, %s: wirft, nichts gespeichert, lokal unverändert (Preferences, Patches)", async (_label, overrides) => {
    const { args, run } = setup({ newPrepPending: false, ...(overrides as object) } as never);
    await expect(run()).rejects.toThrow(/nichts verändert/);
    expect(args.insertNewPlan).not.toHaveBeenCalled();
    expect(args.applyLocally).not.toHaveBeenCalled();
  });

  it("ohne Merker, Speichern scheitert: Fehler geht an den Wizard, lokal unverändert", async () => {
    const { args, run } = setup({
      newPrepPending: false,
      insertNewPlan: jest.fn(async () => {
        throw new Error("save failed");
      }),
    });
    await expect(run()).rejects.toThrow("save failed");
    expect(args.applyLocally).not.toHaveBeenCalled();
  });
});
