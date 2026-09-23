import { freezeTimeForTests } from "../core/time/timeSystem";
import { buildTrainingPlanV2FromBasePlan } from "./fromBasePlan";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";

/**
 * Legacy-Plandaten tragen nur Anzeige-Labels ("2. Nov") ohne Jahr. Früher ergänzte
 * der Default von `parseSessionDateLabel` stumm 2026 — ein Plan, der über
 * Silvester lief, bekam dadurch falsche `dateIso`-Werte, und ab 2027 lagen neue
 * Pläne im Vorjahr. Jetzt gilt die Serverregel (planStartDate → raceDate →
 * aktuelles Jahr) plus Jahreswechsel-Erkennung innerhalb der Sequenz.
 */

function session(id: string, day: string, date: string, type: string, km: number) {
  return { id, day, date, type, title: id, km };
}

/** Nov 2026 → Feb 2027, Race als letzte Session. */
const WINTER_LEGACY_PLAN = [
  {
    wn: 1,
    phase: "BASE",
    s: [session("s-nov-02", "Mo", "2. Nov", "easy", 8), session("s-nov-08", "So", "8. Nov", "long", 20)],
  },
  {
    wn: 2,
    phase: "BUILD",
    s: [session("s-dez-28", "Mo", "28. Dez", "easy", 8), session("s-jan-03", "So", "3. Jan", "long", 22)],
  },
  {
    wn: 3,
    phase: "TAPER",
    s: [session("s-feb-08", "Mo", "8. Feb", "easy", 6), session("s-feb-14", "So", "14. Feb", "race", 42.2)],
  },
];

function ymdById(plan: { workouts: { id: string; dateIso: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const workout of plan.workouts) {
    const d = new Date(workout.dateIso);
    out[workout.id] = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }
  return out;
}

describe("normalizeTrainingPlan — Jahr für Legacy-Labels", () => {
  afterEach(() => {
    freezeTimeForTests(null);
    jest.restoreAllMocks();
  });

  it("verankert am raceDate und rollt das Jahr beim Dez→Jan-Sprung weiter", () => {
    freezeTimeForTests(new Date(2026, 9, 1, 12, 0, 0));

    const plan = normalizeTrainingPlan(WINTER_LEGACY_PLAN, { raceDate: "14.02.2027" });

    expect(ymdById(plan)).toEqual({
      "s-nov-02": "2026-11-02",
      "s-nov-08": "2026-11-08",
      "s-dez-28": "2026-12-28",
      "s-jan-03": "2027-01-03",
      "s-feb-08": "2027-02-08",
      "s-feb-14": "2027-02-14",
    });
  });

  it("verankert am planStartDate, das raceDate schlägt", () => {
    freezeTimeForTests(new Date(2026, 9, 1, 12, 0, 0));

    const plan = normalizeTrainingPlan(WINTER_LEGACY_PLAN, {
      planStartDate: "2.11.2026",
      raceDate: "14.02.2030",
    });

    expect(ymdById(plan)["s-nov-02"]).toBe("2026-11-02");
    expect(ymdById(plan)["s-feb-14"]).toBe("2027-02-14");
  });

  it("liest den Anker auch aus dem Payload selbst (profile.raceDate)", () => {
    freezeTimeForTests(new Date(2026, 9, 1, 12, 0, 0));

    const plan = normalizeTrainingPlan({
      weeks: WINTER_LEGACY_PLAN,
      profile: { raceDate: "2027-02-14" },
    });

    expect(ymdById(plan)["s-nov-02"]).toBe("2026-11-02");
    expect(ymdById(plan)["s-jan-03"]).toBe("2027-01-03");
  });

  it("fällt ohne jeden Anker auf das aktuelle Jahr zurück und warnt", () => {
    freezeTimeForTests(new Date(2029, 5, 1, 12, 0, 0));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const plan = normalizeTrainingPlan(WINTER_LEGACY_PLAN);

    expect(ymdById(plan)["s-nov-02"]).toBe("2029-11-02");
    expect(ymdById(plan)["s-jan-03"]).toBe("2030-01-03");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ohne Jahresanker"));
  });

  it("rät kein Jahr mehr, wenn die Sessions bereits dateIso tragen", () => {
    freezeTimeForTests(new Date(2029, 5, 1, 12, 0, 0));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const plan = normalizeTrainingPlan({
      version: 2,
      workouts: [
        {
          id: "w1",
          dateIso: "2026-03-02T11:00:00.000Z",
          sport: "run",
          sessionType: "easy",
          title: "Easy Run",
          km: 8,
        },
      ],
      weeks: [],
    });

    expect(ymdById(plan)).toEqual({ w1: "2026-03-02" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("buildTrainingPlanV2FromBasePlan — explizites Startjahr", () => {
  afterEach(() => freezeTimeForTests(null));

  it("datiert die Labels in das übergebene Jahr und rollt über Silvester", () => {
    freezeTimeForTests(new Date(2026, 9, 1, 12, 0, 0));

    const plan = buildTrainingPlanV2FromBasePlan(WINTER_LEGACY_PLAN as never, 2026);

    expect(ymdById(plan)).toEqual({
      "s-nov-02": "2026-11-02",
      "s-nov-08": "2026-11-08",
      "s-dez-28": "2026-12-28",
      "s-jan-03": "2027-01-03",
      "s-feb-08": "2027-02-08",
      "s-feb-14": "2027-02-14",
    });
  });
});
