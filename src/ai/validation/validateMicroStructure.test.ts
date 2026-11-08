import type { TrainingPlanV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { validateMicroStructure } from "./validateMicroStructure";
import type { ValidationContext } from "./validationContext";

function planWith(workouts: TrainingPlanV2["workouts"]): TrainingPlanV2 {
  return rebuildPlanFromWorkouts({ workouts });
}

describe("validateMicroStructure", () => {
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

  test("interval + tempo on consecutive days emits warn", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "b", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 14 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect((res.axes.micro?.score ?? 0)).toBeGreaterThanOrEqual(90);
  });

  test("long run followed by next-day medium/high emits warn", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "b", dateIso: new Date(2026, 4, 1, 12, 0, 0).toISOString(), sport: "run", sessionType: "tempo", title: "Tempo", km: 12 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("warn");
    expect((res.axes.micro?.score ?? 0)).toBeGreaterThanOrEqual(90);
  });

  test("valid spacing is allowed", () => {
    const plan = planWith([
      { id: "a", dateIso: new Date(2026, 3, 28, 12, 0, 0).toISOString(), sport: "run", sessionType: "interval", title: "Int", km: 12 },
      { id: "r", dateIso: new Date(2026, 3, 29, 12, 0, 0).toISOString(), sport: "rest", sessionType: "rest", title: "Rest", km: 0 },
      { id: "b", dateIso: new Date(2026, 3, 30, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 10 },
      { id: "c", dateIso: new Date(2026, 4, 2, 12, 0, 0).toISOString(), sport: "run", sessionType: "long", title: "Long", km: 24 },
      { id: "d", dateIso: new Date(2026, 4, 4, 12, 0, 0).toISOString(), sport: "run", sessionType: "easy", title: "Easy", km: 8 },
    ]);
    const res = validateMicroStructure(plan, vctx);
    expect(res.status).toBe("allow");
  });

  // Kern-Plan-Tage: Mittag UTC, wie die Planerzeugung. Der Tag kommt aus dateIso, nie aus einem Label.
  const day = (ymd: string) => `${ymd}T12:00:00.000Z`;
  const run = (id: string, ymd: string, sessionType: string, extra: Partial<TrainingPlanV2["workouts"][number]> = {}) => ({
    id,
    dateIso: day(ymd),
    sport: "run" as const,
    sessionType,
    title: id,
    km: 10,
    ...extra,
  });

  describe("Wochengrenze (Spec §15.5 (3), I6)", () => {
    test("Sonntag hart -> Montag hart: Warnung", () => {
      // 2026-11-08 ist ein Sonntag
      const plan = planWith([run("a", "2026-11-08", "interval", { kind: "I" }), run("b", "2026-11-09", "tempo", { kind: "T" })]);
      const res = validateMicroStructure(plan, vctx);
      expect(res.status).toBe("warn");
      expect(res.axes.micro?.score ?? 0).toBeGreaterThanOrEqual(90);
    });

    test("Sonntag hart -> Montag E: keine Warnung", () => {
      const plan = planWith([
        run("a", "2026-11-08", "interval", { kind: "I" }),
        run("b", "2026-11-09", "easy", { kind: "E" }),
        { id: "r", dateIso: day("2026-11-10"), sport: "rest" as const, sessionType: "rest", title: "Ruhe", km: 0 },
      ]);
      expect(validateMicroStructure(plan, vctx).status).toBe("allow");
    });

    test("Plan über Neujahr: So 03.01.2027 hart -> Mo 04.01.2027 hart warnt", () => {
      const plan = planWith([run("a", "2027-01-03", "interval", { kind: "I" }), run("b", "2027-01-04", "interval", { kind: "I" })]);
      expect(validateMicroStructure(plan, vctx).status).toBe("warn");
    });

    test("Plan über Neujahr: 31.12. hart -> 01.01. hart warnt, mit Ruhetag dazwischen nicht", () => {
      const close = planWith([run("a", "2026-12-31", "interval", { kind: "I" }), run("b", "2027-01-01", "interval", { kind: "I" })]);
      expect(validateMicroStructure(close, vctx).status).toBe("warn");
      const spaced = planWith([
        run("a", "2026-12-31", "interval", { kind: "I" }),
        { id: "r", dateIso: day("2027-01-01"), sport: "rest" as const, sessionType: "rest", title: "Ruhe", km: 0 },
        run("b", "2027-01-02", "tempo", { kind: "T" }),
      ]);
      expect(validateMicroStructure(spaced, vctx).status).toBe("allow");
    });

    test("Tag kommt aus dateIso, nicht aus dem Titel/Label", () => {
      const plan = planWith([
        run("a", "2026-11-08", "interval", { kind: "I", title: "28. Feb" }),
        run("b", "2026-11-09", "interval", { kind: "I", title: "1. Mär" }),
      ]);
      expect(validateMicroStructure(plan, vctx).status).toBe("warn");
    });
  });

  describe("Kern-Definition von hart", () => {
    test("LR+M ist hart (Dauer ≥ 90 min bekannt): LR+M -> Montag Intervall ist Back-to-back", () => {
      const base = planWith([
        run("a", "2026-11-08", "long", { kind: "LR+M", km: 24 }),
        run("b", "2026-11-09", "interval", { kind: "I" }),
      ]);
      const plan: TrainingPlanV2 = {
        ...base,
        meta: {
          core: {
            configVersion: "test",
            rules: {},
            inputs: {
              distance: "m",
              raceDate: "2027-03-14",
              startYmd: "2026-11-02",
              runDaysPerWeek: 5,
              availableDays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
              currentWeeklyKm: 50,
            },
          },
        },
      };
      const res = validateMicroStructure(plan, vctx);
      expect(res.status).toBe("warn");
      expect(res.axes.micro?.reason).toMatch(/Back-to-back/);
    });

    test("MLR ist nie hart: Intervall -> MLR am Folgetag löst Rule 1 nicht aus", () => {
      const plan = planWith([
        run("a", "2026-11-08", "interval", { kind: "I" }),
        run("b", "2026-11-09", "easy", { kind: "MLR", km: 25 }),
        { id: "r", dateIso: day("2026-11-10"), sport: "rest" as const, sessionType: "rest", title: "Ruhe", km: 0 },
      ]);
      expect(validateMicroStructure(plan, vctx).status).toBe("allow");
    });

    test("M unter der km-Schwelle ist nicht hart: M -> Intervall am Folgetag löst Rule 1 nicht aus", () => {
      // M zählt erst ab 5 km bei M-Pace; WorkoutV2 trägt diese km nicht -> nicht hart (Kern-Regel: ohne Zahl nicht hart).
      const plan = planWith([
        run("a", "2026-11-03", "tempo", { kind: "M" }),
        run("b", "2026-11-04", "interval", { kind: "I" }),
        { id: "r", dateIso: day("2026-11-05"), sport: "rest" as const, sessionType: "rest", title: "Ruhe", km: 0 },
      ]);
      const res = validateMicroStructure(plan, vctx);
      expect(res.axes.micro?.score ?? 0).toBeLessThan(90);
    });
  });
});
