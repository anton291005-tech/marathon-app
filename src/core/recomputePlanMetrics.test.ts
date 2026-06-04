import type { AiPlanWeek } from "../lib/ai/types";
import { recomputePlanMetrics } from "./recomputePlanMetrics";

describe("recomputePlanMetrics", () => {
  test("recomputes week.km from non-rest sessions", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "—",
        km: 999,
        s: [
          { id: "a", day: "Mo", date: "30. Apr", type: "easy", title: "Easy", km: 10 },
          { id: "b", day: "Di", date: "1. Mai", type: "rest", title: "Rest", km: 0 },
          { id: "c", day: "Mi", date: "2. Mai", type: "interval", title: "Intervals", km: 12 },
        ],
      },
    ];
    const updated = recomputePlanMetrics(plan);
    expect(updated[0].km).toBe(22);
  });
});

