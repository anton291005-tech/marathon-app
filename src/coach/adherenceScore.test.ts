import {
  computePlanAdherenceScore,
  computePlanAdherenceScoreFromHistory,
} from "./adherenceScore";
import { getAppNow } from "../core/time/timeSystem";

const minimalPlan = [
  {
    wn: 1,
    phase: "MINI",
    km: 10,
    s: [
      {
        id: "t1",
        day: "Mo",
        date: "6. Apr",
        type: "easy",
        title: "Easy",
        km: 5,
        desc: "",
        pace: null,
      },
    ],
  },
];

describe("computePlanAdherenceScore", () => {
  it("returns 100 when no sessions are due yet (all plan dates after today)", () => {
    const r = computePlanAdherenceScore({
      plan: minimalPlan as any,
      logs: {},
      healthRuns: [],
      now: new Date("2026-03-01T12:00:00Z"),
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("green");
    expect(r.confidence).toBe(0);
    expect(r.dueTotal).toBe(0);
  });

  it("returns 0 when due sessions exist and none are done", () => {
    const r = computePlanAdherenceScore({
      plan: minimalPlan as any,
      logs: {},
      healthRuns: [],
      now: new Date("2026-04-10T12:00:00Z"),
    });
    expect(r.score).toBe(0);
    expect(r.band).toBe("red");
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.dueTotal).toBe(1);
    expect(r.dueCompleted).toBe(0);
  });

  it("aggregates full prep: older completed session still affects score when today is later", () => {
    const twoWeekPlan = [
      {
        wn: 1,
        phase: "MINI",
        km: 10,
        s: [
          {
            id: "a",
            day: "Mo",
            date: "6. Apr",
            type: "easy",
            title: "Easy",
            km: 5,
            desc: "",
            pace: null,
          },
          {
            id: "b",
            day: "Di",
            date: "7. Apr",
            type: "easy",
            title: "Easy",
            km: 5,
            desc: "",
            pace: null,
          },
        ],
      },
    ];
    const r = computePlanAdherenceScore({
      plan: twoWeekPlan as any,
      logs: {
        a: { done: true, actualKm: "5", feeling: 4, at: getAppNow().toISOString() },
        b: { done: true, actualKm: "5", feeling: 4, at: getAppNow().toISOString() },
      },
      healthRuns: [],
      now: new Date("2026-04-20T12:00:00Z"),
    });
    expect(r.score).toBe(100);
    expect(r.band).toBe("green");
    expect(r.dueTotal).toBe(2);
    expect(r.dueCompleted).toBe(2);
  });
});

describe("computePlanAdherenceScoreFromHistory", () => {
  it("empty history (nothing due yet) → score 100", () => {
    expect(computePlanAdherenceScoreFromHistory([])).toEqual({ score: 100, confidence: 0 });
  });
});
