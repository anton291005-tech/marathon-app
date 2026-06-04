import type { AiPlanWeek } from "../../lib/ai/types";
import { validatePlanIntegrity } from "./validatePlanIntegrity";

describe("validatePlanIntegrity", () => {
  test("passes for unique IDs and parseable dates", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "—",
        km: 0,
        s: [{ id: "a", day: "Do", date: "30. Apr", type: "easy", title: "Easy", km: 10 }],
      },
    ];
    expect(validatePlanIntegrity(plan)).toBe(true);
  });

  test("fails on duplicate IDs", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "—",
        km: 0,
        s: [
          { id: "a", day: "Do", date: "30. Apr", type: "easy", title: "Easy", km: 10 },
          { id: "a", day: "Fr", date: "1. Mai", type: "bike", title: "Bike", km: 0 },
        ],
      },
    ];
    expect(validatePlanIntegrity(plan)).toBe(false);
  });
});

