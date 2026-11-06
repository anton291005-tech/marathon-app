import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { deriveDisplayPlan } from "../displayPlan/deriveDisplayPlan";
import {
  EMPTY_TRAINING_PLAN_V2,
  normalizeTrainingPlan,
  normalizeWeekMeta,
  weekMetaKey,
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

describe("normalizeTrainingPlan: angebrochene Woche 1 (I21)", () => {
  const workout = (id: string, ymd: string, sessionType: string, km: number) => ({
    id,
    dateIso: `${ymd}T12:00:00.000Z`,
    sport: "run",
    sessionType,
    title: id,
    km,
  });
  // Wie der Server sie ablegt: Woche 1 unter dem Startdatum (Mi), danach Montage; Meta ohne `dates`.
  const week1Meta = { wn: 1, phase: "build", label: "Woche 1 · Aufbau", focus: "Einstieg", isRecoveryWeek: true };
  const week2Meta = { wn: 2, phase: "build", label: "Woche 2 · Aufbau", focus: "Aufbau" };
  const w1 = [workout("a", "2026-11-04", "easy", 8), workout("b", "2026-11-08", "long", 14)];
  const w2 = [workout("c", "2026-11-10", "easy", 9)];

  it("Woche 1 mit Start Mi behält Meta (Plan mit `weeks[].startIso` = Startdatum)", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [...w1, ...w2],
      weeks: [
        { startIso: "2026-11-04", totalKm: 22, meta: week1Meta, workouts: w1 },
        { startIso: "2026-11-09", totalKm: 9, meta: week2Meta, workouts: w2 },
      ],
    });
    expect(plan.weeks.map((w) => w.startIso)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(plan.weeks[0].meta).toEqual({ ...week1Meta, dates: "" });
    expect(plan.weeks[1].meta).toEqual({ ...week2Meta, dates: "" });
  });

  it("Woche 1 behält focus/dates auch im Anzeigeformat (`s`, mit `startIso` Mi)", () => {
    const raw = [
      {
        ...week1Meta,
        dates: "4. Nov – 8. Nov",
        startIso: "2026-11-04",
        km: 22,
        s: w1.map((x) => ({ ...x, type: x.sessionType })),
      },
    ];
    const plan = normalizeTrainingPlan(raw);
    expect(plan.weeks[0].meta).toEqual({ ...week1Meta, dates: "4. Nov – 8. Nov" });
  });

  it("kommt bis in die Anzeige durch", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [...w1, ...w2],
      weeks: [{ startIso: "2026-11-04", totalKm: 22, meta: week1Meta, workouts: w1 }],
    });
    const display = deriveDisplayPlan(plan, []);
    expect(display[0]).toMatchObject({ wn: 1, phase: "build", label: "Woche 1 · Aufbau", focus: "Einstieg" });
  });

  it("Start am Montag bleibt unverändert", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: w1,
      weeks: [{ startIso: "2026-11-02", totalKm: 22, meta: week1Meta, workouts: w1 }],
    });
    expect(plan.weeks[0].meta).toEqual({ ...week1Meta, dates: "" });
  });
});

describe("normalizeTrainingPlan: kind und meta.core", () => {
  const base = {
    id: "w1",
    dateIso: "2026-11-09T12:00:00.000Z",
    sport: "run",
    sessionType: "tempo",
    title: "M-Pace",
    km: 12,
  };
  const core = {
    configVersion: "0.3.0",
    inputs: {
      distance: "m",
      raceDate: "2027-02-28",
      startYmd: "2026-11-09",
      runDaysPerWeek: 4,
      availableDays: ["Mo", "Mi", "Fr", "So"],
      longRunDay: "So",
      currentWeeklyKm: 35,
      recentRace: { distanceKm: 10, timeSeconds: 2700, dateYmd: null, estimated: true },
      goalTime: 12000,
    },
    rules: { avoidTypes: ["I"], maxWeeklyKm: 70, notes: "Knie" },
  };

  it("kind bleibt erhalten, unbekannte Arten fallen weg, ohne kind kein Schlüssel", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [
        { ...base, id: "a", kind: "M" },
        { ...base, id: "b", dateIso: "2026-11-10T12:00:00.000Z", kind: "LR+M" },
        { ...base, id: "c", dateIso: "2026-11-11T12:00:00.000Z", kind: "XYZ" },
        { ...base, id: "d", dateIso: "2026-11-12T12:00:00.000Z" },
      ],
    });
    const byId = Object.fromEntries(plan.workouts.map((w) => [w.id, w]));
    expect(byId.a.kind).toBe("M");
    expect(byId.b.kind).toBe("LR+M");
    expect("kind" in byId.c).toBe(false);
    expect("kind" in byId.d).toBe(false);
    expect(plan.weeks[0].workouts.find((w) => w.id === "a")?.kind).toBe("M");
  });

  it("meta.core bleibt erhalten", () => {
    const plan = normalizeTrainingPlan({ version: 2, workouts: [base], meta: { core } });
    expect(plan.meta?.core).toEqual(core);
  });

  it("freeText in meta.core.inputs fällt weg (Freitext bleibt nur in den Preferences)", () => {
    const withFreeText = { ...core, inputs: { ...core.inputs, freeText: "keine Intervalle" } };
    const plan = normalizeTrainingPlan({ version: 2, workouts: [base], meta: { core: withFreeText } });
    expect(plan.meta?.core).toEqual(core);
    expect(plan.meta?.core?.inputs).not.toHaveProperty("freeText");
  });

  it("unbekannte Felder in meta.core fallen weg", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [base],
      meta: {
        core: {
          ...core,
          extra: 1,
          inputs: { ...core.inputs, extra: 2, recentRace: { ...core.inputs.recentRace, extra: 3 } },
          rules: { ...core.rules, extra: 4 },
        },
      },
    });
    expect(plan.meta?.core).toEqual(core);
  });

  it("ungültige optionale Felder fallen weg, ungültige Pflichtfelder verwerfen core ganz", () => {
    const lenient = normalizeTrainingPlan({
      version: 2,
      workouts: [base],
      meta: { core: { ...core, inputs: { ...core.inputs, goalTime: -5, longRunDay: "Xx" }, rules: { avoidTypes: ["I", "Q"], maxMinutesByDay: { Mo: 5, Di: 90 } } } },
    });
    expect(lenient.meta?.core?.inputs.goalTime).toBeUndefined();
    expect(lenient.meta?.core?.inputs.longRunDay).toBeUndefined();
    expect(lenient.meta?.core?.rules).toEqual({ avoidTypes: ["I"], maxMinutesByDay: { Di: 90 } });

    for (const broken of [
      { ...core, configVersion: "" },
      { ...core, inputs: { ...core.inputs, distance: "ultra" } },
      { ...core, inputs: { ...core.inputs, raceDate: "2027-02-30" } },
      { ...core, inputs: { ...core.inputs, runDaysPerWeek: 7 } },
      { ...core, inputs: { ...core.inputs, availableDays: ["Mo"] } },
      { ...core, rules: null },
    ]) {
      const plan = normalizeTrainingPlan({ version: 2, workouts: [base], meta: { core: broken } });
      expect(plan.meta).toBeUndefined();
    }
  });

  it("volumeNote und core stehen nebeneinander", () => {
    const volumeNote = { code: "peak-not-reached", reason: "growth", targetPeakKm: 80, reachedPeakKm: 70 };
    const plan = normalizeTrainingPlan({ version: 2, workouts: [base], meta: { volumeNote, core } });
    expect(plan.meta).toEqual({ volumeNote, core });
  });
});

describe("weekMetaKey", () => {
  it("liefert den Montag der Woche, unabhängig von der Zeitzone des Rechners", () => {
    const expected: Array<[string, string]> = [
      ["2026-11-02", "2026-11-02"],
      ["2026-11-04", "2026-11-02"],
      ["2026-11-08", "2026-11-02"],
      ["2026-11-09", "2026-11-09"],
      ["2026-11-09T12:00:00.000Z", "2026-11-09"],
      ["2027-01-01", "2026-12-28"],
    ];
    for (const [input, monday] of expected) expect(weekMetaKey(input)).toBe(monday);
  });

  it("reicht Unbrauchbares unverändert durch", () => {
    expect(weekMetaKey("kein-datum")).toBe("kein-datum");
  });
});

describe("kind bis in die Anzeige", () => {
  const workout = (id: string, ymd: string, sessionType: string, kind?: string) => ({
    id,
    dateIso: `${ymd}T12:00:00.000Z`,
    sport: "run",
    sessionType,
    title: id,
    km: 10,
    ...(kind ? { kind } : {}),
  });

  it("kind erreicht PlanSession und AiPlanSession; ohne kind gibt es keinen Schlüssel", () => {
    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [workout("a", "2026-11-09", "tempo", "M"), workout("b", "2026-11-10", "easy")],
    });
    const sessions = deriveDisplayPlan(plan, [])[0].s;
    expect(sessions.find((s) => s.id === "a")?.kind).toBe("M");
    expect("kind" in sessions.find((s) => s.id === "b")!).toBe(false);
  });
});
