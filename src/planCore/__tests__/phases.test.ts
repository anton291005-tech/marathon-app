import { CONFIG } from "../config";
import { addDays, diffDays, mondayOf, weekdayOf } from "../dates";
import { isPlanCoreError, planPhases } from "../phases";
import type { PhaseInputs } from "../phases";
import type { Distance, Ymd } from "../types";

/** Sonntag, 14.3.2027. */
const RACE_SUNDAY: Ymd = "2027-03-14";

/** Plan über genau `weeks` Kalenderwochen: Start am Montag (oder `startOffset` Tage später), Rennen am `raceDate`. */
function inputsFor(distance: Distance, weeks: number, raceDate: Ymd = RACE_SUNDAY, startOffset = 0): PhaseInputs {
  return { distance, raceDate, startYmd: addDays(mondayOf(raceDate), -7 * (weeks - 1) + startOffset) };
}

function codeOf(run: () => unknown): string | null {
  try {
    run();
  } catch (error) {
    return isPlanCoreError(error) ? error.code : "other";
  }
  return null;
}

describe("planCore phases (§4)", () => {
  it("der Test-Renntag ist ein Sonntag", () => {
    expect(weekdayOf(RACE_SUNDAY)).toBe("So");
  });

  it("5k: 1 Taper-Woche, Rest 35/35/30 (8 Wochen → 3 Basis, 2 Aufbau, 2 Spitze, 1 Taper)", () => {
    const plan = planPhases(inputsFor("5k", 8));
    expect(plan.weeks.map((week) => week.phase)).toEqual([
      "base", "base", "base", "build", "build", "peak", "peak", "taper",
    ]);
    expect(plan.taperWeeks).toBe(1);
  });

  it("M: 2 Taper-Wochen (16 Wochen → 5/5/4/2)", () => {
    const plan = planPhases(inputsFor("m", 16));
    expect(plan.phaseWeeks).toEqual({ base: 5, build: 5, peak: 4, taper: 2 });
  });

  it("Taper-Wochen nach Distanz: 5k/10k 1, HM/M 2", () => {
    const expected: Record<Distance, number> = { "5k": 1, "10k": 1, hm: 2, m: 2 };
    (Object.keys(expected) as Distance[]).forEach((distance) => {
      expect(planPhases(inputsFor(distance, 12)).taperWeeks).toBe(expected[distance]);
    });
  });

  it("unter der harten Untergrenze gibt es keinen Plan, genau darauf schon", () => {
    (["5k", "10k", "hm", "m"] as const).forEach((distance) => {
      const min = CONFIG.planLength.hardMinWeeks.value[distance];
      expect(codeOf(() => planPhases(inputsFor(distance, min - 1)))).toBe("plan-too-short");
      expect(codeOf(() => planPhases(inputsFor(distance, min)))).toBeNull();
    });
  });

  it("über dem Maximum beginnt der Plan erst Max Wochen vor dem Rennen (am Montag), der Rest sind freie Wochen", () => {
    const max = CONFIG.planLength.maxWeeks.value.m;
    const plan = planPhases(inputsFor("m", max + 3, RACE_SUNDAY, 4));
    expect(plan.weeks).toHaveLength(max);
    expect(plan.freeWeeks).toBe(3);
    expect(weekdayOf(plan.effectiveStartYmd)).toBe("Mo");
    expect(plan.weeks[0].days).toBe(7);
    expect(plan.weeks[0].startYmd).toBe(plan.effectiveStartYmd);
  });

  it("angebrochene Woche 1: Start am Mittwoch, Wochen laufen lückenlos bis zum Renntag", () => {
    const inputs = inputsFor("hm", 12, RACE_SUNDAY, 2);
    expect(weekdayOf(inputs.startYmd)).toBe("Mi");
    const plan = planPhases(inputs);
    expect(plan.weeks).toHaveLength(12);
    expect(plan.weeks[0].days).toBe(5);
    expect(plan.weeks[0].firstDayYmd).toBe(inputs.startYmd);
    expect(plan.weeks[0].startYmd).toBe(mondayOf(inputs.startYmd));
    expect(plan.weeks.map((week) => week.wn)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(plan.weeks[11].lastDayYmd).toBe(RACE_SUNDAY);
    expect(plan.weeks.reduce((sum, week) => sum + week.days, 0)).toBe(diffDays(RACE_SUNDAY, inputs.startYmd) + 1);
    for (let i = 1; i < plan.weeks.length; i += 1) {
      expect(diffDays(plan.weeks[i].firstDayYmd, plan.weeks[i - 1].lastDayYmd)).toBe(1);
    }
  });

  describe("kurze Rennwoche (< 4 Tage) bekommt eine Zusatz-Taper-Woche", () => {
    it.each([
      ["Montag", "2027-03-15", 1, 3],
      ["Mittwoch", "2027-03-17", 3, 3],
      ["Donnerstag", "2027-03-18", 4, 2],
      ["Sonntag", "2027-03-14", 7, 2],
    ])("M, Rennen am %s (%s, %d Tage)", (_name, raceDate, days, taper) => {
      const plan = planPhases(inputsFor("m", 14, raceDate));
      expect(plan.weeks[plan.weeks.length - 1].days).toBe(days);
      expect(plan.taperWeeks).toBe(taper);
    });

    it("5k mit Rennen am Montag: 2 Taper-Wochen", () => {
      expect(planPhases(inputsFor("5k", 8, "2027-03-15")).taperWeeks).toBe(2);
    });
  });

  it("jede Phase hat mindestens eine Woche, sobald 6 Restwochen da sind; die Phasen liegen in Reihenfolge", () => {
    (["5k", "10k", "hm", "m"] as const).forEach((distance) => {
      const hardMin = CONFIG.planLength.hardMinWeeks.value[distance];
      const max = CONFIG.planLength.maxWeeks.value[distance];
      for (let weeks = hardMin; weeks <= max; weeks += 1) {
        const plan = planPhases(inputsFor(distance, weeks));
        const rest = weeks - plan.taperWeeks;
        const minEach = rest >= CONFIG.phases.minRestWeeksForAllPhases.value ? 1 : 0;
        expect(plan.phaseWeeks.base).toBeGreaterThanOrEqual(minEach);
        expect(plan.phaseWeeks.build).toBeGreaterThanOrEqual(minEach);
        expect(plan.phaseWeeks.peak).toBeGreaterThanOrEqual(1);
        const order = plan.weeks.map((week) => ["base", "build", "peak", "taper"].indexOf(week.phase));
        expect(order).toEqual(order.slice().sort((a, b) => a - b));
        expect(plan.weeks[weeks - 1].phase).toBe("taper");
      }
    });
  });

  it("unter der Empfehlung wird gemeldet", () => {
    expect(planPhases(inputsFor("m", 10)).belowRecommended).toBe(true);
    expect(planPhases(inputsFor("m", 12)).belowRecommended).toBe(false);
  });

  it("lehnt ungültige Eingaben mit Code ab", () => {
    const ok = inputsFor("10k", 10);
    expect(codeOf(() => planPhases({ ...ok, distance: "marathon" as unknown as Distance }))).toBe("invalid-input");
    expect(codeOf(() => planPhases({ ...ok, raceDate: "2027-02-30" }))).toBe("invalid-input");
    expect(codeOf(() => planPhases({ ...ok, startYmd: "morgen" }))).toBe("invalid-input");
    expect(codeOf(() => planPhases({ ...ok, startYmd: addDays(ok.raceDate, 1) }))).toBe("invalid-input");
  });

  it("ist deterministisch", () => {
    const inputs = inputsFor("hm", 13, "2027-05-19", 3);
    expect(planPhases(inputs)).toEqual(planPhases(inputs));
  });
});
