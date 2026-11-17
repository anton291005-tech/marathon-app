import { updateTrainingPlanGoalMeta } from "./trainingPlanService";

type Row = { data: unknown; updated_at: string };

const mockState: { row: Row | null; updates: Array<{ data: unknown; filters: Record<string, unknown> }>; updatedAtOnWrite: string | null } = {
  row: null,
  updates: [],
  updatedAtOnWrite: null,
};

jest.mock("../client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q = { eq: () => q, maybeSingle: async () => ({ data: mockState.row, error: null }) };
        return q;
      },
      update: (payload: { data: unknown }) => {
        const filters: Record<string, unknown> = {};
        const q = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return q;
          },
          select: async () => {
            // Optimistische Sperre: ein zwischenzeitlicher Speichervorgang hat updated_at verändert.
            const current = mockState.updatedAtOnWrite ?? mockState.row?.updated_at;
            if (filters.updated_at !== undefined && filters.updated_at !== current) return { data: [], error: null };
            mockState.updates.push({ data: payload.data, filters });
            return { data: [{ id: filters.id }], error: null };
          },
        };
        return q;
      },
    }),
  },
}));

const planData = (goal?: unknown) => ({
  version: 2,
  workouts: [
    { id: "a", dateIso: "2026-11-17", sport: "run", sessionType: "easy", title: "Locker", km: 8 },
    { id: "b", dateIso: "2026-11-22", sport: "run", sessionType: "race", title: "Rennen", km: 21.1 },
  ],
  ...(goal ? { meta: { goal } } : {}),
});

describe("updateTrainingPlanGoalMeta", () => {
  beforeEach(() => {
    mockState.updates = [];
    mockState.updatedAtOnWrite = null;
  });

  it("Nachtrag schreibt nur, wenn die Zeile beim frischen Lesen noch kein Ziel hat", async () => {
    mockState.row = { data: planData({ raceGoal: "time", targetTime: "1:40:00" }), updated_at: "t1" };
    await expect(updateTrainingPlanGoalMeta("u", "p", { raceGoal: "time", targetTime: "1:50:00" }, "backfill")).resolves.toBe(true);
    expect(mockState.updates).toEqual([]);

    mockState.row = { data: planData(), updated_at: "t1" };
    await expect(updateTrainingPlanGoalMeta("u", "p", { raceGoal: "time", targetTime: "1:50:00" }, "backfill")).resolves.toBe(true);
    expect(mockState.updates).toHaveLength(1);
    expect(mockState.updates[0].filters).toMatchObject({ id: "p", user_id: "u", updated_at: "t1" });
    expect((mockState.updates[0].data as any).meta.goal).toEqual({ raceGoal: "time", targetTime: "1:50:00" });
  });

  it("hat ein anderer Speichervorgang dazwischen geschrieben, wird nichts überschrieben", async () => {
    mockState.row = { data: planData(), updated_at: "t1" };
    mockState.updatedAtOnWrite = "t2";
    await expect(updateTrainingPlanGoalMeta("u", "p", { raceGoal: "finish", targetTime: null }, "edit")).resolves.toBe(false);
    expect(mockState.updates).toEqual([]);
  });

  it("Eingabe überschreibt ein vorhandenes Ziel", async () => {
    mockState.row = { data: planData({ raceGoal: "time", targetTime: "1:40:00" }), updated_at: "t1" };
    await expect(updateTrainingPlanGoalMeta("u", "p", { raceGoal: "time", targetTime: "1:38:00" }, "edit")).resolves.toBe(true);
    expect((mockState.updates[0].data as any).meta.goal).toEqual({ raceGoal: "time", targetTime: "1:38:00" });
  });
});
