import { resetDistanceSystemMetricsForTests } from "./distanceIntegrity";
import { toAiPlanWeeks, reconcileWeekPlannedKmForAi } from "./lib/ai/planToAi";
import {
  computeStructuredWorkoutDistance,
  formatKm,
  getDisplayPlannedDistanceKm,
  getPlannedKmEquiv,
  getSessionPlannedDistanceKm,
  isDistanceBasedSession,
  parseStructuredWorkoutSpecFromDesc,
  resolveSessionPlannedDistanceKm,
  USE_COMPUTED_WEEK_KM,
} from "./marathonPrediction";
import {
  getWeekPlannedLoadKm,
  getWeekPlannedKmForDisplay,
  getWeekRunningDistanceKm,
  validateWeekDistances,
  weekPlannedRunningKm,
} from "./weeklyAnalysis";

beforeEach(() => {
  resetDistanceSystemMetricsForTests();
});

describe("computeStructuredWorkoutDistance", () => {
  it("sums warmup, intervals, cooldown (6×1km example)", () => {
    const w = {
      warmupKm: 2,
      cooldownKm: 2,
      intervals: [{ reps: 6, distanceKm: 1 }],
    };
    expect(computeStructuredWorkoutDistance(w)).toBe(10);
  });

  it("handles no warmup / no cooldown", () => {
    expect(
      computeStructuredWorkoutDistance({
        intervals: [{ reps: 4, distanceKm: 1 }],
      }),
    ).toBe(4);
  });

  it("handles only steady tempo blocks", () => {
    expect(
      computeStructuredWorkoutDistance({
        steadyBlocksKm: [8, 2],
      }),
    ).toBe(10);
  });

  it("handles strides (full precision)", () => {
    expect(
      computeStructuredWorkoutDistance({
        steadyBlocksKm: [8],
        strides: [{ count: 6, meters: 80 }],
      }),
    ).toBeCloseTo(8.48, 5);
  });
});

describe("formatKm", () => {
  it("rounds to one decimal", () => {
    expect(formatKm(8.48)).toBe(8.5);
    expect(formatKm(10)).toBe(10);
  });
});

describe("getDisplayPlannedDistanceKm / isDistanceBasedSession", () => {
  it("returns null for strength and bike; load equiv unchanged for strength", () => {
    const strength = { id: "k", type: "strength", km: 8, title: "Kraft", desc: "" };
    expect(isDistanceBasedSession(strength)).toBe(false);
    expect(getDisplayPlannedDistanceKm(strength)).toBeNull();
    expect(getPlannedKmEquiv(strength as any)).toBe(8);
  });

  it("returns planned km for running types", () => {
    const easy = { id: "e", type: "easy", km: 10, title: "Easy", desc: "" };
    expect(isDistanceBasedSession(easy)).toBe(true);
    expect(getDisplayPlannedDistanceKm(easy)).toBe(10);
  });
});

describe("getWeekRunningDistanceKm / getWeekPlannedLoadKm", () => {
  it("week: interval 10 + easy 10 + strength → 20 km Lauf, 28 km Volumen; weekPlannedRunningKm unchanged for recovery path", () => {
    const week: any = {
      wn: 9,
      phase: "BASE",
      km: 100,
      s: [
        {
          id: "a",
          day: "Mi",
          date: "1. Jan",
          type: "interval",
          title: "I",
          km: 12,
          desc: "2km WU · 6×1000m @ 4:20/km · 2km CD.",
        },
        { id: "b", day: "Do", date: "2. Jan", type: "easy", title: "E", km: 10, desc: "" },
        { id: "c", day: "Fr", date: "3. Jan", type: "strength", title: "K", km: 8, desc: "Beine" },
      ],
    };
    expect(getWeekRunningDistanceKm(week)).toBe(20);
    // Strength sessions no longer contribute km to Trainingsvolumen (only Lauf + Rennrad count)
    expect(getWeekPlannedLoadKm(week)).toBe(20);
    expect(weekPlannedRunningKm(week)).toBe(20);
  });
});

describe("parseStructuredWorkoutSpecFromDesc", () => {
  it("parses canonical interval line", () => {
    const spec = parseStructuredWorkoutSpecFromDesc(
      "2km WU · 6×1000m @ 4:20/km (90s Trottpause) · 2km CD.",
    );
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBeCloseTo(11.5, 1);
    expect(spec!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("parses 6x1km style reps", () => {
    const spec = parseStructuredWorkoutSpecFromDesc("2km WU · 6x1km @ 4:20/km · 2km CD.");
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBe(10);
  });

  it("parses missing bullet separators (dense)", () => {
    const spec = parseStructuredWorkoutSpecFromDesc("2km WU 6x1km 2km CD");
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBe(10);
  });

  it("parses tempo with multiple steady segments", () => {
    const spec = parseStructuredWorkoutSpecFromDesc(
      "2km WU · 8km @ 4:08–4:12/km (Schwelle) · 2km easy · 2km CD.",
    );
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBe(14);
  });

  it("parses zügig block", () => {
    const spec = parseStructuredWorkoutSpecFromDesc("2km WU · 3km zügig · 2km CD");
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBe(7);
    expect(spec!.confidence).toBeLessThan(0.6);
  });

  it("treats 6×80m as strides when labeled", () => {
    const spec = parseStructuredWorkoutSpecFromDesc("8 km easy, dann 6×80m Strides");
    expect(spec).not.toBeNull();
    expect(computeStructuredWorkoutDistance(spec!.workout)).toBeCloseTo(8.48, 5);
  });

  it("returns null for empty or non-recipe text", () => {
    expect(parseStructuredWorkoutSpecFromDesc("")).toBeNull();
    expect(parseStructuredWorkoutSpecFromDesc("   ")).toBeNull();
    expect(parseStructuredWorkoutSpecFromDesc("Einfach locker laufen.")).toBeNull();
  });

  it("returns null for malformed interval token", () => {
    expect(parseStructuredWorkoutSpecFromDesc("6×km ohne Distanz")).toBeNull();
  });
});

describe("getSessionPlannedDistanceKm / resolveSessionPlannedDistanceKm", () => {
  const base = (partial: Record<string, unknown>) => ({
    id: "t",
    day: "Mi",
    date: "1. Jan",
    type: "easy",
    title: "Test",
    km: 0,
    ...partial,
  });

  it("8×1000m with 90s pause totals ~14 km (WU + reps + recovery jogs + CD)", () => {
    const s = base({
      type: "interval",
      km: 14,
      desc: "2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km CD.",
    });
    expect(getSessionPlannedDistanceKm(s)).toBeCloseTo(14.1, 1);
  });

  it("merges explicit structured intervals with desc WU/CD/recovery", () => {
    const s = base({
      type: "interval",
      km: 12,
      desc: "2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km easy · 2km CD.",
      structured: { intervals: [{ reps: 8, distanceKm: 1 }] },
    });
    expect(getSessionPlannedDistanceKm(s)).toBeCloseTo(16.1, 1);
  });

  it("uses explicit structured over plan row km", () => {
    const s = base({
      type: "interval",
      km: 13,
      structured: { warmupKm: 2, cooldownKm: 2, intervals: [{ reps: 6, distanceKm: 1 }] },
    });
    expect(getSessionPlannedDistanceKm(s)).toBe(10);
    expect(resolveSessionPlannedDistanceKm(s).source).toBe("structured");
  });

  it("parses desc for interval when no structured field", () => {
    const s = base({
      type: "interval",
      km: 13,
      desc: "2km WU · 6×1000m @ 4:20/km · 2km CD.",
    });
    expect(getSessionPlannedDistanceKm(s)).toBe(10);
    expect(resolveSessionPlannedDistanceKm(s).source).toBe("parsed");
  });

  it("falls back to plan km for easy run", () => {
    const s = base({ type: "easy", km: 10, desc: "Locker." });
    expect(getSessionPlannedDistanceKm(s)).toBe(10);
    expect(resolveSessionPlannedDistanceKm(s).source).toBe("fallback");
  });

  it("does not parse long-run narrative desc; uses row km", () => {
    const s = base({
      type: "long",
      km: 23,
      desc: "17km easy → letzte 6km @ 4:10/km.",
    });
    expect(getSessionPlannedDistanceKm(s)).toBe(23);
  });

  it("uses row km for race without recipe", () => {
    const s = base({ type: "race", km: 42.2, desc: "START 🔥 Erste Hälfte …" });
    expect(getSessionPlannedDistanceKm(s)).toBe(42.2);
  });

  it("emits distanceIntegrity mismatch when structured and desc disagree", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const s = base({
      type: "interval",
      km: 13,
      desc: "2km WU · 6×1000m @ 4:20/km · 2km CD.",
      structured: { warmupKm: 2, cooldownKm: 2, intervals: [{ reps: 5, distanceKm: 1 }] },
    });
    getSessionPlannedDistanceKm(s);
    expect(warn).toHaveBeenCalledWith(
      "[distanceIntegrity]",
      expect.objectContaining({ tag: "DISTANCE_MISMATCH" }),
    );
    warn.mockRestore();
  });

  it("rejects full parse when min confidence < 0.6 (zügig) and uses legacy row on recipe", () => {
    const s = base({
      type: "tempo",
      km: 14,
      desc: "2km WU · 3km zügig · 2km CD",
    });
    const r = resolveSessionPlannedDistanceKm(s);
    expect(r.km).toBe(14);
    expect(r.source).toBe("legacy");
  });
});

describe("weekPlannedRunningKm & week consistency", () => {
  it("matches structured session totals", () => {
    const week = {
      wn: 3,
      phase: "BASE",
      km: 50,
      s: [
        {
          id: "w03-mi",
          day: "Mi",
          date: "22. Apr",
          type: "interval",
          title: "Intervall: 6×1000m",
          km: 13,
          desc: "2km WU · 6×1000m @ 4:20/km (90s Trottpause) · 2km CD.",
          pace: "4:20/km",
        },
      ],
    };
    expect(weekPlannedRunningKm(week)).toBe(11.5);
  });

  it("weekly km equals sum of unique running sessions (no double count)", () => {
    const week = simulateWeek();
    const sum = week.s.reduce((acc, s) => {
      if (s.type === "rest" || s.type === "strength" || s.type === "bike") return acc;
      return acc + getSessionPlannedDistanceKm(s);
    }, 0);
    expect(weekPlannedRunningKm(week)).toBe(formatKm(sum));
  });

  it("simulateWeek integration: interval + easy + long", () => {
    const week = simulateWeek();
    expect(weekPlannedRunningKm(week)).toBe(38);
  });

  it("validateWeekDistances records week mismatch when week.km off > 2 km", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const week = {
      wn: 1,
      phase: "BASE",
      km: 100,
      s: [
        {
          id: "a",
          day: "Mi",
          date: "1. Jan",
          type: "easy",
          title: "E",
          km: 10,
        },
      ],
    };
    validateWeekDistances(week);
    expect(warn).toHaveBeenCalledWith(
      "[distanceIntegrity]",
      expect.objectContaining({ tag: "WEEK_KM_MISMATCH" }),
    );
    warn.mockRestore();
  });

  it("getWeekPlannedKmForDisplay uses session sum when USE_COMPUTED_WEEK_KM", () => {
    expect(USE_COMPUTED_WEEK_KM).toBe(true);
    const week = {
      wn: 3,
      phase: "BASE",
      km: 13,
      s: [
        {
          id: "w03-mi",
          day: "Mi",
          date: "22. Apr",
          type: "interval",
          title: "Intervall",
          km: 13,
          desc: "2km WU · 6×1000m @ 4:20/km · 2km CD.",
        },
      ],
    };
    expect(getWeekPlannedKmForDisplay(week)).toBe(10);
  });
});

describe("simulateRealisticPlan (integration)", () => {
  function simulateRealisticPlan() {
    return [
      {
        wn: 1,
        phase: "BASE",
        km: 59,
        s: [
          {
            id: "int-struct",
            day: "Mi",
            date: "1. Jan",
            type: "interval",
            title: "I",
            km: 20,
            desc: "Fallback desc",
            structured: { warmupKm: 2, cooldownKm: 2, intervals: [{ reps: 4, distanceKm: 1 }] },
          },
          {
            id: "tmp-parse",
            day: "Do",
            date: "2. Jan",
            type: "tempo",
            title: "T",
            km: 20,
            desc: "2km WU · 3km @ 4:20/km · 2km easy · 2km CD",
          },
          {
            id: "easy-fb",
            day: "Fr",
            date: "3. Jan",
            type: "easy",
            title: "E",
            km: 10,
            desc: "Locker",
          },
          {
            id: "long",
            day: "So",
            date: "5. Jan",
            type: "long",
            title: "L",
            km: 32,
            desc: "Stetig",
          },
        ],
      },
    ] as const;
  }

  it("resolves all session km, week sum, and AI week consistently", () => {
    const plan = simulateRealisticPlan();
    const week = plan[0] as any;
    expect(getSessionPlannedDistanceKm(week.s[0])).toBe(8);
    expect(getSessionPlannedDistanceKm(week.s[1])).toBe(9);
    expect(getSessionPlannedDistanceKm(week.s[2])).toBe(10);
    expect(getSessionPlannedDistanceKm(week.s[3])).toBe(32);
    const wk = weekPlannedRunningKm(week);
    expect(wk).toBe(59);
    const aiWeeks = toAiPlanWeeks(plan as any);
    expect(aiWeeks[0].km).toBe(wk);
    const sumAi = aiWeeks[0].s.reduce(
      (a, s) => a + s.km,
      0,
    );
    expect(sumAi).toBe(reconcileWeekPlannedKmForAi(week as any));
    expect(validateWeekDistances(week as any)).toBeUndefined();
  });
});

function simulateWeek() {
  return {
    wn: 99,
    phase: "BASE",
    km: 999,
    s: [
      {
        id: "sim-int",
        day: "Mi",
        date: "22. Apr",
        type: "interval",
        title: "Intervals",
        km: 13,
        desc: "2km WU · 6×1000m @ 4:20/km · 2km CD.",
      },
      {
        id: "sim-easy",
        day: "Do",
        date: "23. Apr",
        type: "easy",
        title: "Easy",
        km: 10,
        desc: "Locker.",
      },
      {
        id: "sim-long",
        day: "So",
        date: "26. Apr",
        type: "long",
        title: "Long",
        km: 18,
        desc: "Easy long.",
      },
    ],
  };
}
