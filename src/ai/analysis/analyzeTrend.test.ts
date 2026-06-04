import { analyzeTrend } from "./analyzeTrend";

describe("ai/analysis analyzeTrend (Level 3)", () => {
  test("single workout history => insufficient_data", () => {
    const res = analyzeTrend({
      history: [{ date: "2026-05-01", load: 50, effortRatio: 1 }],
      recovery: [{ date: "2026-05-01", score0_100: 80 }],
    });
    expect(res?.trend).toBe("insufficient_data");
    expect(res?.confidence).toBe(0);
  });

  test("overreaching when strain high and recovery decreasing", () => {
    const history = [
      { date: "2026-05-01", load: 40, effortRatio: 1 },
      { date: "2026-05-02", load: 45, effortRatio: 1.1 },
      { date: "2026-05-03", load: 48, effortRatio: 1.1 },
      { date: "2026-05-04", load: 55, effortRatio: 1.2 },
      { date: "2026-05-05", load: 60, effortRatio: 1.2 },
      { date: "2026-05-06", load: 70, effortRatio: 1.3 },
      { date: "2026-05-07", load: 75, effortRatio: 1.3 },
      { date: "2026-05-08", load: 140, effortRatio: 1.35 },
      { date: "2026-05-09", load: 160, effortRatio: 1.35 },
      { date: "2026-05-10", load: 170, effortRatio: 1.35 },
    ];
    const recovery = [
      { date: "2026-05-01", score0_100: 32 },
      { date: "2026-05-02", score0_100: 30 },
      { date: "2026-05-03", score0_100: 28 },
      { date: "2026-05-04", score0_100: 26 },
      { date: "2026-05-05", score0_100: 24 },
      { date: "2026-05-06", score0_100: 22 },
      { date: "2026-05-07", score0_100: 20 },
      { date: "2026-05-08", score0_100: 18 },
      { date: "2026-05-09", score0_100: 16 },
      { date: "2026-05-10", score0_100: 14 },
    ];
    const res = analyzeTrend({ history, recovery });
    expect(res?.trend).toBe("overreaching");
    expect((res?.confidence ?? 0)).toBeGreaterThan(0);
  });

  test("deterministic output for identical input", () => {
    const args = {
      history: [
        { date: "2026-05-01", load: 40, effortRatio: 1 },
        { date: "2026-05-02", load: 42, effortRatio: 1 },
        { date: "2026-05-03", load: 41, effortRatio: 1 },
        { date: "2026-05-04", load: 40, effortRatio: 1 },
      ],
      recovery: [
        { date: "2026-05-01", score0_100: 70 },
        { date: "2026-05-02", score0_100: 70 },
        { date: "2026-05-03", score0_100: 70 },
        { date: "2026-05-04", score0_100: 70 },
      ],
    };
    const a = analyzeTrend(args);
    const b = analyzeTrend(args);
    expect(a).toEqual(b);
  });

  test("missing/insufficient recovery is always deterministic insufficient_data", () => {
    const history = [
      { date: "2026-05-01", load: 40, effortRatio: 1 },
      { date: "2026-05-02", load: 42, effortRatio: 1 },
      { date: "2026-05-03", load: 41, effortRatio: 1 },
      { date: "2026-05-04", load: 40, effortRatio: 1 },
      { date: "2026-05-05", load: 41, effortRatio: 1 },
    ];
    const resA = analyzeTrend({ history, recovery: null });
    const resB = analyzeTrend({ history: [...history].reverse(), recovery: null });
    expect(resA?.trend).toBe("insufficient_data");
    expect(resB?.trend).toBe("insufficient_data");
    expect(resA).toEqual(resB);
  });

  test("shuffled inputs => identical output", () => {
    const history = [
      { date: "2026-05-01", load: 40, effortRatio: 1 },
      { date: "2026-05-02", load: 42, effortRatio: 1 },
      { date: "2026-05-03", load: 41, effortRatio: 1 },
      { date: "2026-05-04", load: 40, effortRatio: 1 },
      { date: "2026-05-05", load: 39, effortRatio: 1 },
      { date: "2026-05-06", load: 41, effortRatio: 1 },
    ];
    const recovery = [
      { date: "2026-05-01", score0_100: 70 },
      { date: "2026-05-02", score0_100: 71 },
      { date: "2026-05-03", score0_100: 69 },
      { date: "2026-05-04", score0_100: 70 },
      { date: "2026-05-05", score0_100: 70 },
      { date: "2026-05-06", score0_100: 70 },
    ];
    const a = analyzeTrend({ history, recovery });
    const b = analyzeTrend({ history: [history[2], history[0], history[5], history[1], history[4], history[3]], recovery: [...recovery].reverse() });
    expect(a).toEqual(b);
  });
});

