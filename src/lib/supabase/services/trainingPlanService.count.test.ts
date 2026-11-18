import { countTrainingPlans } from "./trainingPlanService";

const mockResult: { value: { count: number | null; error: { message: string } | null } | Error } = {
  value: { count: 0, error: null },
};

jest.mock("../client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: async () => {
          if (mockResult.value instanceof Error) throw mockResult.value;
          return mockResult.value;
        },
      }),
    }),
  },
}));

describe("countTrainingPlans", () => {
  it("liefert die Zahl aller Pläne", async () => {
    mockResult.value = { count: 2, error: null };
    await expect(countTrainingPlans("u")).resolves.toBe(2);
  });
  it("Fehler ist „unbekannt“ (null), nie 0", async () => {
    mockResult.value = { count: null, error: { message: "boom" } };
    await expect(countTrainingPlans("u")).resolves.toBeNull();
    mockResult.value = new Error("offline");
    await expect(countTrainingPlans("u")).resolves.toBeNull();
  });
});
