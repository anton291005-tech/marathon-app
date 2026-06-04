import type { WorkoutV2 } from "../../planV2/types";
import type { WeekPhaseMeta } from "../../core/getWorkoutPhase";
import { validatePhaseSwap } from "./validatePhaseSwap";
import type { ValidationContext } from "./validationContext";

function weekPhaseMapFixture(): Map<string, WeekPhaseMeta> {
  return new Map<string, WeekPhaseMeta>([
    ["2026-04-27", { weekStartIso: "2026-04-27", phase: "base" }],
    ["2026-05-04", { weekStartIso: "2026-05-04", phase: "build" }],
    ["2026-08-03", { weekStartIso: "2026-08-03", phase: "peak" }],
    ["2026-09-07", { weekStartIso: "2026-09-07", phase: "taper" }],
  ]);
}

function w(id: string, dateIso: string, sessionType: string): WorkoutV2 {
  return {
    id,
    dateIso,
    sport: sessionType === "bike" ? "bike" : sessionType === "rest" ? "rest" : "run",
    sessionType,
    title: id,
    km: 10,
  };
}

describe("validatePhaseSwap", () => {
  const vctx: ValidationContext = {
    planGoal: "marathon",
    currentWeekLoad: 60,
    weeklyAvgLoad: 55,
    recoverySummary: {
      avgRecovery: 55,
      avgConfidence: 0.5,
      influenceWeight: 0.65,
      adjustedRecoveryInfluence: 35.75,
      recoveryStatus: "normal",
    },
    phase: "build",
  };

  test("interval -> taper is warning (overrideable)", () => {
    const m = weekPhaseMapFixture();
    const source = w("s", new Date("2026-05-07T12:00:00.000Z").toISOString(), "interval"); // build week
    const target = w("t", new Date("2026-09-10T12:00:00.000Z").toISOString(), "easy"); // taper week
    const res = validatePhaseSwap(source, target, { weekPhaseMap: m, validationContext: vctx });
    expect(res.status).toBe("warn");
    expect((res.axes.structural?.score ?? 0)).toBeGreaterThan(0);
  });

  test("long run -> base is warning (overrideable)", () => {
    const m = weekPhaseMapFixture();
    const source = w("s", new Date("2026-05-07T12:00:00.000Z").toISOString(), "long"); // build week
    const target = w("t", new Date("2026-04-30T12:00:00.000Z").toISOString(), "easy"); // base week
    const res = validatePhaseSwap(source, target, { weekPhaseMap: m, validationContext: vctx });
    expect(res.axes.structural?.score).toBeGreaterThan(0);
  });

  test("peak -> peak gives warning only", () => {
    const m = weekPhaseMapFixture();
    const source = w("s", new Date("2026-08-06T12:00:00.000Z").toISOString(), "tempo"); // peak week
    const target = w("t", new Date("2026-08-08T12:00:00.000Z").toISOString(), "easy"); // same peak week
    const res = validatePhaseSwap(source, target, { weekPhaseMap: m, validationContext: vctx });
    expect(res.status).toBe("warn");
    expect(typeof res.axes.structural?.reason).toBe("string");
  });

  test("normal swap is allowed", () => {
    const m = weekPhaseMapFixture();
    const source = w("s", new Date("2026-05-07T12:00:00.000Z").toISOString(), "easy"); // build week
    const target = w("t", new Date("2026-04-30T12:00:00.000Z").toISOString(), "easy"); // base week
    const res = validatePhaseSwap(source, target, { weekPhaseMap: m, validationContext: vctx });
    expect(res.status).toBe("allow");
  });
});

