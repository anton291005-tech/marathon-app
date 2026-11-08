import type { TrainingPlanV2, WorkoutV2 } from "../../planV2/types";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import { buildSwapAthleteFacingWarnings } from "./validateSwap";

// Mit meta.core.inputs (ohne recentRace = Einsteiger-Pace) ist die Dauer eines Long Runs bekannt (km × E-Pace).
const planWith = (workouts: WorkoutV2[]): TrainingPlanV2 => ({
  ...rebuildPlanFromWorkouts({ workouts }),
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
});
const w = (id: string, ymd: string, sessionType: string, extra: Partial<WorkoutV2> = {}): WorkoutV2 => ({
  id,
  dateIso: `${ymd}T12:00:00.000Z`,
  sport: "run",
  sessionType,
  title: id,
  km: 10,
  ...extra,
});

const longBeforeInterval = (out: string[]) => out.some((m) => m.includes("Intervall- oder Tempotraining direkt nach einem langen"));
const backToBack = (out: string[]) => out.some((m) => m.includes("zwei intensive Einheiten an aufeinanderfolgenden Tagen"));

describe("buildSwapAthleteFacingWarnings (Kern-Definition von hart)", () => {
  test("LR+M zählt als Long Run und als hart", () => {
    const after = planWith([w("a", "2026-11-08", "long", { kind: "LR+M", km: 24 }), w("b", "2026-11-09", "interval", { kind: "I" })]);
    const out = buildSwapAthleteFacingWarnings({ before: after, after });
    expect(longBeforeInterval(out)).toBe(true);
    expect(backToBack(out)).toBe(true);
  });

  test("MLR ist weder Long Run noch hart, auch bei 25 km", () => {
    const after = planWith([w("a", "2026-11-08", "easy", { kind: "MLR", km: 25 }), w("b", "2026-11-09", "interval", { kind: "I" })]);
    const out = buildSwapAthleteFacingWarnings({ before: after, after });
    expect(longBeforeInterval(out)).toBe(false);
    expect(backToBack(out)).toBe(false);
  });

  test("15 km allein machen keinen Long Run mehr", () => {
    const after = planWith([w("a", "2026-11-08", "easy", { kind: "E", km: 16 }), w("b", "2026-11-09", "interval", { kind: "I" })]);
    expect(longBeforeInterval(buildSwapAthleteFacingWarnings({ before: after, after }))).toBe(false);
  });

  test("Sonntag hart -> Montag hart warnt; Sonntag hart -> Montag E nicht", () => {
    const hard = planWith([w("a", "2026-11-08", "interval", { kind: "I" }), w("b", "2026-11-09", "tempo", { kind: "T" })]);
    expect(backToBack(buildSwapAthleteFacingWarnings({ before: hard, after: hard }))).toBe(true);
    const easy = planWith([w("a", "2026-11-08", "interval", { kind: "I" }), w("b", "2026-11-09", "easy", { kind: "E" })]);
    expect(backToBack(buildSwapAthleteFacingWarnings({ before: easy, after: easy }))).toBe(false);
  });

  test("Neujahr: 31.12. hart -> 01.01. hart warnt", () => {
    const after = planWith([w("a", "2026-12-31", "interval", { kind: "I" }), w("b", "2027-01-01", "interval", { kind: "I" })]);
    expect(backToBack(buildSwapAthleteFacingWarnings({ before: after, after }))).toBe(true);
  });

  test("Ruhepuffer geht verloren: So hart, Mo Ruhe, Di hart -> Tausch füllt den Ruhetag", () => {
    const rest: WorkoutV2 = { id: "r", dateIso: "2026-11-09T12:00:00.000Z", sport: "rest", sessionType: "rest", title: "Ruhe", km: 0 };
    const before = planWith([w("a", "2026-11-08", "interval", { kind: "I" }), rest, w("c", "2026-11-10", "tempo", { kind: "T" })]);
    const after = planWith([w("a", "2026-11-08", "interval", { kind: "I" }), w("e", "2026-11-09", "easy", { kind: "E" }), w("c", "2026-11-10", "tempo", { kind: "T" })]);
    expect(buildSwapAthleteFacingWarnings({ before, after }).some((m) => m.includes("kein Ruhetag mehr"))).toBe(true);
  });
});
