import { CONFIG } from "../config";
import { addDays, mondayOf, WEEKDAYS } from "../dates";
import { codesOf, unreasoned } from "../__fixtures__/compact";
import { checkPlanLayouts } from "../invariants";
import { layoutWeeks } from "../placement";
import type { WeekLayout } from "../placement";
import { planPhases } from "../phases";
import { createRng } from "../random";
import type { Distance, RunDays, Weekday, Ymd } from "../types";

const SEED = 20261105;
const CASES = 2000;
const DISTANCES: Distance[] = ["5k", "10k", "hm", "m"];

type Case = {
  distance: Distance;
  runDaysPerWeek: RunDays;
  availableDays: Weekday[];
  longRunDay: Weekday | undefined;
  raceDate: Ymd;
  startYmd: Ymd;
  beginner: boolean;
  weeks: number;
};

function randomCase(seed: number): Case {
  const rng = createRng(seed);
  const distance = rng.pick(DISTANCES);
  const runDaysPerWeek = rng.int(3, 6) as RunDays;
  const size = rng.int(runDaysPerWeek, 7);
  const picked = rng.shuffle(WEEKDAYS).slice(0, size);
  const availableDays = WEEKDAYS.filter((day) => picked.indexOf(day) >= 0);
  const raceDate = addDays("2027-02-01", rng.int(0, 400));
  const weeks = rng.int(CONFIG.planLength.hardMinWeeks.value[distance], CONFIG.planLength.maxWeeks.value[distance] + 2);
  const startYmd = addDays(mondayOf(raceDate), -7 * (weeks - 1) + rng.int(0, 6));
  return {
    distance,
    runDaysPerWeek,
    availableDays,
    longRunDay: rng.chance(0.5) ? undefined : rng.pick(availableDays),
    raceDate,
    startYmd,
    beginner: rng.chance(0.4),
    weeks,
  };
}

function layoutsOf(c: Case): { layouts: WeekLayout[]; longRunDay: Weekday } {
  const phases = planPhases({ distance: c.distance, raceDate: c.raceDate, startYmd: c.startYmd });
  const layouts = layoutWeeks(
    {
      distance: c.distance,
      raceDate: c.raceDate,
      runDaysPerWeek: c.runDaysPerWeek,
      availableDays: c.availableDays,
      longRunDay: c.longRunDay,
    },
    phases,
    { beginner: c.beginner },
  );
  const longRunDay =
    c.longRunDay ?? (c.availableDays.indexOf("So") >= 0 ? "So" : c.availableDays.indexOf("Sa") >= 0 ? "Sa" : c.availableDays[c.availableDays.length - 1]);
  return { layouts, longRunDay };
}

describe(`Wochenformen über zufällige Pläne (Seed ${SEED}, ${CASES} Fälle)`, () => {
  it("I6 über alle Wochengrenzen, I7, I10, I13–I16 (Layout-Anteile), Sandwich, Lauftage ⊆ verfügbare Tage", () => {
    const problems: string[] = [];
    const seen = { weekOneChecked: 0, partialWeekOne: 0, qDropped: 0, noLongRun: 0, mlrAsE: 0, raceQGap: 0, raceWeekdays: {} as Record<string, number> };

    for (let index = 0; index < CASES; index += 1) {
      const caseSeed = SEED + index;
      const c = randomCase(caseSeed);
      const { layouts, longRunDay } = layoutsOf(c);
      const label = `seed ${caseSeed}`;

      // Jede Woche für sich (Zustand der Vorwoche weitergereicht) und der ganze Plan; begründete Abweichungen zählen nicht.
      codesOf(
        unreasoned(
          checkPlanLayouts(layouts, {
            distance: c.distance,
            runDays: c.runDaysPerWeek,
            availableDays: c.availableDays,
            longRunDay,
            raceDate: c.raceDate,
          }),
        ),
      ).forEach((code) => problems.push(`${label}: ${code}`));

      layouts.forEach((layout) => {
        layout.notes.forEach((note) => {
          if (note.code === "q1-dropped" || note.code === "q2-dropped") seen.qDropped += 1;
          if (note.code === "no-long-run-in-window") seen.noLongRun += 1;
          if (note.code === "mlr-as-e") seen.mlrAsE += 1;
          if (note.code === "q-dropped-race-gap") seen.raceQGap += 1;
        });
      });
      if (layouts[0].days.length < 7) seen.partialWeekOne += 1;
      // Woche 1 (ohne Vorwoche) ist der Ausschnitt der Folgewoche gleicher Art.
      const [one, two] = layouts;
      if (one.mode === "base" && two.mode === "base" && two.days.length === 7) {
        const offset = 7 - one.days.length;
        const same = one.days.every((day, i) => day.slot === two.days[offset + i].slot);
        if (!same) problems.push(`${label}: week-1-differs-from-week-2`);
        seen.weekOneChecked += 1;
      }
      const raceDay = layouts[layouts.length - 1].days.length;
      seen.raceWeekdays[raceDay] = (seen.raceWeekdays[raceDay] || 0) + 1;
    }

    expect(problems.slice(0, 10)).toEqual([]);
    // Die Fälle decken die Sonderfälle wirklich ab (sonst prüft der Test nichts).
    expect(seen.partialWeekOne).toBeGreaterThan(CASES / 4);
    expect(seen.weekOneChecked).toBeGreaterThan(CASES / 2);
    expect(seen.qDropped).toBeGreaterThan(20);
    expect(seen.noLongRun).toBeGreaterThan(100);
    expect(seen.mlrAsE).toBeGreaterThan(5);
    expect(seen.raceQGap).toBeGreaterThan(20);
    expect(Object.keys(seen.raceWeekdays)).toHaveLength(7);
  });

  it("ist deterministisch (I20-Anteil): zweimal gerechnet, gleiche Wochenformen", () => {
    for (let index = 0; index < 200; index += 1) {
      const c = randomCase(SEED + index);
      expect(layoutsOf(c).layouts).toEqual(layoutsOf(c).layouts);
    }
  });
});
