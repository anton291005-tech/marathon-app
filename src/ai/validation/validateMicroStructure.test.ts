import type { TrainingPlanV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import {
  collectMicroFindings,
  computeMicroStructureDelta,
  validateMicroStructure,
  KEY_SESSION_EVE_SEVERITY,
  PHYSICAL_EVENT_ADJACENT_SEVERITY,
} from "./validateMicroStructure";
import type { ValidationContext } from "./validationContext";

type RawWorkout = TrainingPlanV2["workouts"][number];

function ctx(phase: ValidationContext["phase"]): ValidationContext {
  return {
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
    phase,
  };
}
const vctx = ctx("build");

// Zwei Wege: (a) rohe Workouts ohne intensity (Fallback des Validators), (b) wie in Produktion über die
// Pflicht-Grenzfunktion normalizeTrainingPlan — dort wird intensity aus core/loadClass gesetzt.
const BUILDERS: Array<[string, (w: RawWorkout[]) => TrainingPlanV2]> = [
  ["roh (ohne intensity)", (w) => rebuildPlanFromWorkouts({ workouts: w })],
  ["über normalizeTrainingPlan", (w) => normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts: w }))],
];

// Montag 2026-10-05 .. Sonntag 2026-10-11 (eine ISO-Woche)
const day = (d: number) => new Date(2026, 9, d, 12, 0, 0).toISOString();
const run = (id: string, d: number, sessionType: string, extra: Partial<RawWorkout> = {}): RawWorkout => ({
  id,
  dateIso: day(d),
  sport: "run",
  sessionType,
  title: sessionType,
  km: 10,
  ...extra,
});
const rest = (id: string, d: number): RawWorkout => ({ id, dateIso: day(d), sport: "rest", sessionType: "rest", title: "Rest", km: 0 });

describe.each(BUILDERS)("validateMicroStructure – %s", (_name, build) => {
  test("interval + tempo on consecutive days emits warn", () => {
    const plan = build([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "b", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 14 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect(res.axes.micro?.score ?? 0).toBeGreaterThanOrEqual(90);
  });

  test("long run followed by next-day medium/high emits warn", () => {
    const plan = build([
      { id: "a", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "b", dateIso: new Date(2026, 4, 1, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 12 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect(res.axes.micro?.score ?? 0).toBeGreaterThanOrEqual(90);
  });

  test("valid spacing is allowed", () => {
    const plan = build([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "r", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "rest", sessionType: "rest", title: "Rest", km: 0 },
      { id: "b", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 10 },
      { id: "c", dateIso: new Date(2026, 4, 2, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "d", dateIso: new Date(2026, 4, 4, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 8 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("allow");
  });

  describe("harte Einheit am Vortag eines Long Runs", () => {
    const week = (hardType: string, longExtra: Partial<RawWorkout> = {}) => [
      rest("mo", 5),
      run("di", 6, "easy"),
      run("mi", 7, "easy"),
      rest("do", 8),
      run("fr", 9, "easy"),
      run("sa", 10, hardType),
      run("so", 11, "long", longExtra),
    ];

    test.each(["interval", "tempo"] as const)("%s am Samstag, Long Run am Sonntag → Warnung (mind. Schweregrad 75) in jeder Phase", (hard) => {
      for (const phase of ["base", "build", "peak", "taper"] as const) {
        const res = validateMicroStructure(build(week(hard)), ctx(phase));
        expect(res.status).toBe("warn");
        expect(res.axes.micro?.score ?? 0).toBeGreaterThanOrEqual(KEY_SESSION_EVE_SEVERITY);
        expect(res.axes.micro?.reason).toBeTruthy();
      }
    });

    test("Warngrund nennt den Long Run (build)", () => {
      const res = validateMicroStructure(build(week("interval")), ctx("build"));
      expect(res.axes.micro?.reason).toMatch(/Long Run/);
    });

    test("lockerer Lauf am Samstag → keine Warnung", () => {
      const res = validateMicroStructure(build(week("easy")), ctx("build"));
      expect(res.status).toBe("allow");
    });

    test("Ruhetag zwischen hartem Tag und Long Run → keine Warnung", () => {
      const plan = build([rest("mo", 5), run("di", 6, "easy"), run("mi", 7, "easy"), rest("do", 8), run("fr", 9, "interval"), rest("sa", 10), run("so", 11, "long")]);
      expect(validateMicroStructure(plan, ctx("build")).status).toBe("allow");
    });

    test("Intervall am Tag NACH dem Long Run wird weiter über die bestehende Regel erkannt", () => {
      const plan = build([rest("mo", 5), run("di", 6, "easy"), run("mi", 7, "easy"), run("do", 8, "easy"), rest("fr", 9), run("sa", 10, "long"), run("so", 11, "interval")]);
      expect(validateMicroStructure(plan, ctx("build")).status).toBe("warn");
    });
  });
});

describe("validateMicroStructure – nur über normalizeTrainingPlan (Belastungsklasse aus core/loadClass)", () => {
  const normalized = (w: RawWorkout[]) => normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts: w }));
  const base = (sat: RawWorkout, sun: RawWorkout) => [rest("mo", 5), run("di", 6, "easy"), run("mi", 7, "easy"), rest("do", 8), run("fr", 9, "easy"), sat, sun];

  test("veraltetes gespeichertes long=low (älterer Claude-Plan) verdeckt den Befund nicht", () => {
    const plan = normalized(base(run("sa", 10, "interval"), run("so", 11, "long", { intensity: "low" })));
    const res = validateMicroStructure(plan, ctx("build"));
    expect(res.status).toBe("warn");
    expect(res.axes.micro?.score).toBe(KEY_SESSION_EVE_SEVERITY);
  });

  test("Tempo gilt als high: Tempo am Samstag, Intervall am Sonntag → Back-to-back (95)", () => {
    const plan = normalized(base(run("sa", 10, "tempo", { intensity: "medium" }), run("so", 11, "interval")));
    expect(validateMicroStructure(plan, ctx("build")).axes.micro?.score).toBe(95);
  });

  test("Long Run mit Renntempo-Anteil gilt als high: Intervall am Samstag davor → Back-to-back (95)", () => {
    const plan = normalized(base(run("sa", 10, "interval"), run("so", 11, "long", { title: "Long Run 28 km mit MP" })));
    expect(validateMicroStructure(plan, ctx("build")).axes.micro?.score).toBe(95);
  });

  test("'Tempodauerlauf' im Titel eines Easy Runs macht ihn nicht hart", () => {
    const plan = normalized(base(run("sa", 10, "easy", { title: "Tempodauerlauf locker" }), run("so", 11, "long")));
    expect(validateMicroStructure(plan, ctx("build")).status).toBe("allow");
  });

  test("schwerer Befund wird nicht von leichteren Hinweisen verdrängt (Top-3 nach Schweregrad)", () => {
    // Zwei Wochen ohne Ruhetag liefern frühe Hinweise (35); der Befund in der dritten Woche darf nicht abfallen.
    const wk = (startDay: number, hardSat: boolean): RawWorkout[] => [
      run(`m${startDay}`, startDay, "easy"),
      run(`t${startDay}`, startDay + 1, "easy"),
      run(`w${startDay}`, startDay + 2, "easy"),
      run(`d${startDay}`, startDay + 3, "easy"),
      run(`f${startDay}`, startDay + 4, "easy"),
      run(`s${startDay}`, startDay + 5, hardSat ? "interval" : "easy"),
      run(`u${startDay}`, startDay + 6, "long"),
    ];
    const plan = normalized([...wk(5, false), ...wk(12, false), ...wk(19, true)]);
    expect(validateMicroStructure(plan, ctx("build")).axes.micro?.score ?? 0).toBeGreaterThanOrEqual(KEY_SESSION_EVE_SEVERITY);
  });
});

describe("Nachbarregel: harte Einheit neben einem körperlich belastenden Termin", () => {
  const build = (w: RawWorkout[]) => normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts: w }));
  // Termin am Mittwoch 2026-10-07
  const eventOn = (ymd: string) => (date: string) => (date === ymd ? ["Sprint-Prüfung"] : []);
  const options = { externalLoadTitlesOf: eventOn("2026-10-07") };
  const adjacent = (plan: TrainingPlanV2, opts = options) =>
    collectMicroFindings(plan, vctx, opts).filter((f) => f.rule === "physical_event_adjacent");

  test.each([
    ["am Vortag", 6],
    ["am Folgetag", 8],
  ])("Intervall %s des Termins → Befund mit Schweregrad 75", (_label, d) => {
    const findings = adjacent(build([run("a", d, "interval"), rest("r", 10)]));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(PHYSICAL_EVENT_ADJACENT_SEVERITY);
    expect(findings[0].dates[1]).toBe("2026-10-07");
  });

  test.each(["base", "build", "peak", "taper"] as const)("Schweregrad ist in Phase %s derselbe (Warnung, nie Sperre)", (phase) => {
    const findings = collectMicroFindings(build([run("a", 6, "tempo"), rest("r", 10)]), ctx(phase), options);
    expect(findings.filter((f) => f.rule === "physical_event_adjacent").map((f) => f.severity)).toEqual([75]);
  });

  test("lockere Einheit, Long Run ohne Renntempo und Ruhetag neben dem Termin: kein Befund", () => {
    expect(adjacent(build([run("a", 6, "easy"), run("b", 8, "long"), rest("r", 10)]))).toEqual([]);
  });

  test("Long Run mit Renntempo-Anteil am Folgetag zählt als harte Einheit", () => {
    expect(adjacent(build([run("a", 8, "long", { title: "MP-Workout 24 km" }), rest("r", 10)]))).toHaveLength(1);
  });

  test("zwei Tage Abstand und der Termintag selbst lösen die Regel nicht aus", () => {
    expect(adjacent(build([run("a", 5, "interval"), run("b", 7, "easy"), run("c", 9, "tempo"), rest("r", 10)]))).toEqual([]);
    // Termintag selbst: läuft über den Kalender-Fit (Deckel 0,2), nicht über die Nachbarregel.
    expect(adjacent(build([run("a", 7, "interval"), rest("r", 10)]))).toEqual([]);
  });

  test("ohne Kalendersicht (Chat-Swap, Generator-Prüfung) gibt es die Regel nicht", () => {
    expect(adjacent(build([run("a", 6, "interval"), rest("r", 10)]), {} as typeof options)).toEqual([]);
  });

  test("Delta: Bestand zählt nicht, nur eine neu neben den Termin gelegte harte Einheit", () => {
    const before = build([run("a", 5, "interval"), run("b", 6, "easy"), run("c", 8, "tempo"), rest("r", 10)]);
    const unchanged = computeMicroStructureDelta(before, before, vctx, options);
    expect(unchanged.severity).toBe(0); // Tempo am Tag nach dem Termin ist Altbestand

    const after = build([run("a", 6, "interval"), run("b", 5, "easy"), run("c", 8, "tempo"), rest("r", 10)]);
    const delta = computeMicroStructureDelta(before, after, vctx, options);
    expect(delta.newFindings.map((f) => f.rule)).toEqual(["physical_event_adjacent"]);
    expect(delta.severity).toBe(75);
    expect(delta.tier).toBe(2);
    expect(delta.warnings).toHaveLength(1);
  });
});
