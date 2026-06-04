import type { AiPlanWeek } from "../../lib/ai/types";
import { safeSwapWorkouts } from "./safeSwapWorkouts";

describe("safeSwapWorkouts", () => {
  test("swaps date/day across weeks without duplicates", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "—",
        km: 0,
        s: [
          { id: "a", day: "Do", date: "30. Apr", type: "easy", title: "Easy", km: 10 },
          { id: "b", day: "Fr", date: "1. Mai", type: "bike", title: "Bike", km: 0 },
        ],
      },
      {
        wn: 2,
        phase: "BASE",
        label: "W2",
        dates: "—",
        km: 0,
        s: [{ id: "c", day: "Do", date: "7. Mai", type: "bike", title: "Rennrad", km: 0 }],
      },
    ];

    const updated = safeSwapWorkouts(plan, "a", "c");
    const flat = updated.flatMap((w) => w.s);
    const a = flat.find((s) => s.id === "a");
    const c = flat.find((s) => s.id === "c");
    expect(a?.date).toBe("7. Mai");
    expect(c?.date).toBe("30. Apr");
    expect(new Set(flat.map((s) => s.id)).size).toBe(flat.length);
  });

  test("rejects swap when source === target", () => {
    const plan: AiPlanWeek[] = [
      { wn: 1, phase: "BASE", label: "W1", dates: "—", km: 0, s: [{ id: "a", day: "Do", date: "30. Apr", type: "easy", title: "Easy", km: 10 }] },
    ];
    const updated = safeSwapWorkouts(plan, "a", "a");
    expect(updated).toEqual(plan);
  });
});

