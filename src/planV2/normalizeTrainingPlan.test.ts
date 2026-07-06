import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import {
  EMPTY_TRAINING_PLAN_V2,
  normalizeTrainingPlan,
  normalizeWeekMeta,
} from "./normalizeTrainingPlan";

describe("normalizeTrainingPlan", () => {
  const validWorkout = {
    id: "w1-mo",
    dateIso: "2026-03-02T11:00:00.000Z",
    sport: "run",
    sessionType: "easy",
    title: "Easy Run",
    km: 8,
  };

  it("returns empty plan for null, undefined, and empty object", () => {
    expect(normalizeTrainingPlan(null)).toEqual(EMPTY_TRAINING_PLAN_V2);
    expect(normalizeTrainingPlan(undefined)).toEqual(EMPTY_TRAINING_PLAN_V2);
    expect(normalizeTrainingPlan({})).toEqual(EMPTY_TRAINING_PLAN_V2);
    expect(normalizeTrainingPlan([])).toEqual(EMPTY_TRAINING_PLAN_V2);
  });

  it("returns empty plan for version-2 shell without workouts", () => {
    expect(normalizeTrainingPlan({ version: 2, workouts: [], weeks: [] })).toEqual(
      EMPTY_TRAINING_PLAN_V2,
    );
  });

  it("normalizes a valid V2 plan without throwing", () => {
    const raw = {
      version: 2,
      workouts: [validWorkout],
      weeks: [
        {
          startIso: "2026-03-02",
          totalKm: 8,
          workouts: [validWorkout],
          meta: { wn: 1, phase: "BASE", label: "Woche 1", dates: "2.–8. Mär" },
        },
      ],
    };
    const plan = normalizeTrainingPlan(raw);
    expect(() => validateTrainingPlanV2Integrity(plan)).not.toThrow();
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].meta?.label).toBe("Woche 1");
  });

  it("repairs legacy week array missing s, label, and phase", () => {
    const raw = [
      {
        wn: 3,
        km: 0,
        dates: "9.–15. Mär",
      },
      {
        wn: 4,
        s: [
          {
            id: "w4-mo",
            day: "Mo",
            date: "16. Mär",
            type: "easy",
            km: 10,
          },
        ],
      },
    ];
    expect(() => normalizeTrainingPlan(raw)).not.toThrow();
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].title).toBe("Training");
    expect(plan.workouts[0].km).toBe(10);
    expect(plan.weeks[0].meta?.phase).toBe("base");
    expect(plan.weeks[0].meta?.label).toMatch(/Woche/);
  });

  it("repairs weeks with missing s array and missing label/phase on V2 wrapper", () => {
    const raw = {
      version: 2,
      workouts: [
        {
          id: "sess-1",
          dateIso: "2026-04-06T11:00:00.000Z",
          sessionType: "tempo",
          title: "",
          km: "12,5",
        },
      ],
      weeks: [
        {
          startIso: "2026-04-06",
          totalKm: 999,
          workouts: "not-an-array",
          meta: {},
        },
      ],
    };
    expect(() => normalizeTrainingPlan(raw)).not.toThrow();
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts[0].title).toBe("Tempo");
    expect(plan.workouts[0].km).toBe(12.5);
    expect(plan.weeks[0].meta?.phase).toBe("base");
    expect(plan.weeks[0].meta?.label).toMatch(/Woche 1/);
    expect(plan.weeks[0].totalKm).toBe(12.5);
  });

  it("repairs sessions missing title, km, sessionType, and date via legacy s[]", () => {
    const raw = {
      version: 2,
      weeks: [
        {
          wn: 2,
          phase: "BUILD",
          label: "",
          dates: "",
          s: [
            { id: "broken-1", day: "Di", date: "3. Mär" },
            { id: "broken-2", day: "Mi", date: "4. Mär", type: "rest" },
          ],
        },
      ],
    };
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts).toHaveLength(2);
    expect(plan.workouts[0].sessionType).toBe("easy");
    expect(plan.workouts[0].title).toBe("Training");
    expect(plan.workouts[0].km).toBe(0);
    expect(plan.workouts[1].sessionType).toBe("rest");
    expect(plan.workouts[1].title).toBe("Ruhetag");
    expect(plan.weeks[0].meta?.phase).toBe("build");
    expect(plan.weeks[0].meta?.label).toMatch(/Woche 2/);
  });

  it("dedupes duplicate workout ids instead of throwing", () => {
    const raw = {
      version: 2,
      workouts: [
        { ...validWorkout, id: "dup" },
        { ...validWorkout, id: "dup", dateIso: "2026-03-03T11:00:00.000Z", km: 6 },
      ],
      weeks: [],
    };
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts).toHaveLength(2);
    expect(new Set(plan.workouts.map((w) => w.id)).size).toBe(2);
  });

  it("skips sessions with unparseable dates without throwing", () => {
    const raw = {
      version: 2,
      workouts: [
        validWorkout,
        { id: "bad-date", dateIso: "not-a-date", sessionType: "easy", title: "X", km: 1 },
      ],
    };
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts).toHaveLength(1);
  });

  it("fills every WeekV2 meta field with safe defaults", () => {
    const meta = normalizeWeekMeta({}, 0);
    expect(meta.wn).toBe(1);
    expect(meta.phase).toBe("base");
    expect(meta.label).toMatch(/Woche 1/);
    expect(meta.dates).toBe("");
    expect(meta.focus).toBeUndefined();
    expect(meta.isRecoveryWeek).toBeUndefined();
  });

  it("normalizes uppercase legacy phase strings to canonical phase meta", () => {
    const meta = normalizeWeekMeta({ phase: "PEAK", wn: 7 }, 6);
    expect(meta.phase).toBe("peak");
    expect(meta.label).toMatch(/Woche 7/);
  });

  it("handles null week entries and empty week shells without throwing", () => {
    const raw = {
      version: 2,
      weeks: [null, {}, { wn: 5, phase: "", label: null, s: null }],
      workouts: [
        {
          id: "only-one",
          dateIso: "2026-05-04T11:00:00.000Z",
          sessionType: "long",
          km: 28,
        },
      ],
    };
    expect(() => normalizeTrainingPlan(raw)).not.toThrow();
    const plan = normalizeTrainingPlan(raw);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    expect(plan.workouts[0].title).toBe("Long Run");
    expect(plan.workouts[0].sport).toBe("run");
  });

  it("normalizes every WorkoutV2 field including optional sport/intensity/desc/pace", () => {
    const raw = {
      version: 2,
      workouts: [
        {
          id: "",
          dateIso: "2026-06-01T11:00:00.000Z",
          sessionType: "bike",
          sport: "bike",
          intensity: "medium",
          title: null,
          km: "15",
          desc: "  ",
          pace: "easy",
        },
      ],
    };
    const plan = normalizeTrainingPlan(raw);
    expect(plan.workouts[0].id).toMatch(/^normalized-workout-/);
    expect(plan.workouts[0].title).toBe("Rad");
    expect(plan.workouts[0].km).toBe(15);
    expect(plan.workouts[0].sport).toBe("bike");
    expect(plan.workouts[0].intensity).toBe("medium");
    expect(plan.workouts[0].desc).toBeNull();
    expect(plan.workouts[0].pace).toBe("easy");
  });
});
