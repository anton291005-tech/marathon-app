import { analyzeWorkout } from "../analyzeWorkout";

function permute<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  const rev = [...xs].reverse();
  const rotated = xs.length >= 3 ? [xs[1], xs[2], xs[0], ...xs.slice(3)] : [xs[1], xs[0]];
  const swapped = xs.length >= 4 ? [xs[0], xs[2], xs[1], ...xs.slice(3)] : [...xs];
  return [[...xs], rev, rotated, swapped];
}

describe("ai/analysis determinism (order invariance + repeatability)", () => {
  const workout = {
    durationMinutes: 60,
    actualHrBpm: 150,
    expectedHrBpm: 140,
    actualPaceSecPerKm: 330,
    plannedPaceSecPerKm: { min: 320, max: 340 },
  };

  const history = [
    { date: "2026-04-21", load: 40, effortRatio: 1.0 },
    { date: "2026-04-24", load: 45, effortRatio: 1.05 },
    { date: "2026-04-26", load: 52, effortRatio: 1.1 },
    { date: "2026-04-28", load: 46, effortRatio: 0.98 },
    { date: "2026-04-30", load: 60, effortRatio: 1.15 },
    { date: "2026-05-01", load: 55, effortRatio: 1.05 },
  ];

  const recovery = [
    { date: "2026-04-21", score0_100: 74 },
    { date: "2026-04-24", score0_100: 72 },
    { date: "2026-04-26", score0_100: 71 },
    { date: "2026-04-28", score0_100: 70 },
    { date: "2026-04-30", score0_100: 69 },
    { date: "2026-05-01", score0_100: 68 },
  ];

  test("shuffled workout history arrays => identical output", () => {
    const outputs = permute(history).map((h) => analyzeWorkout({ workout, history: h, recovery }));
    for (let i = 1; i < outputs.length; i++) expect(outputs[i]).toEqual(outputs[0]);
  });

  test("shuffled recovery arrays => identical output", () => {
    const outputs = permute(recovery).map((r) => analyzeWorkout({ workout, history, recovery: r }));
    for (let i = 1; i < outputs.length; i++) expect(outputs[i]).toEqual(outputs[0]);
  });

  test("shuffled mixed inputs => identical output", () => {
    const outputs = [];
    const hs = permute(history);
    const rs = permute(recovery);
    for (let i = 0; i < Math.max(hs.length, rs.length); i++) {
      outputs.push(analyzeWorkout({ workout, history: hs[i % hs.length], recovery: rs[i % rs.length] }));
    }
    for (let i = 1; i < outputs.length; i++) expect(outputs[i]).toEqual(outputs[0]);
  });

  test("repeated execution (10 runs) => identical output", () => {
    const first = analyzeWorkout({ workout, history, recovery });
    for (let i = 0; i < 10; i++) {
      expect(analyzeWorkout({ workout, history, recovery })).toEqual(first);
    }
  });
});

