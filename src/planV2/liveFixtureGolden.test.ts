import { deriveDisplayPlan } from "../displayPlan/deriveDisplayPlan";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { rebuildPlanFromWorkouts } from "../core/deriveWeeksFromWorkouts";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";
import type { WeekV2 } from "./types";

/**
 * Golden-Stand der Live-Pläne (src/testSupport/fixtures/livePlan*.json), erzeugt VOR Schritt 3
 * (`fix/plan-contract-passthrough`) mit dem damaligen Code. Bestehende Pläne müssen byte-gleich normalisiert und
 * angezeigt werden; einzige gewollte Änderung ist die Meta von Woche 1 bei einem Start mitten in der Woche.
 */
const NAMES = ["livePlan10k-2026-12-22", "livePlanHalf-2027-01-31", "livePlanMarathon-2027-02-28"];

const load = (name: string, kind: "normalized" | "display"): string =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  JSON.stringify(require(`./__fixtures__/golden/${name}.${kind}.json`), null, 1) + "\n";
const raw = (name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require(`../testSupport/fixtures/${name}.json`) as { workouts: any[] };

beforeAll(() => freezeTimeForTests(new Date("2026-11-04T10:00:00.000Z")));
afterAll(() => freezeTimeForTests(null));

describe.each(NAMES)("Live-Fixture %s", (name) => {
  it("normalisiert byte-gleich zum Golden-Stand", () => {
    const normalized = normalizeTrainingPlan({ version: 2, workouts: raw(name).workouts });
    expect(JSON.stringify(normalized, null, 1) + "\n").toBe(load(name, "normalized"));
  });

  it("wird byte-gleich angezeigt", () => {
    const normalized = normalizeTrainingPlan({ version: 2, workouts: raw(name).workouts });
    expect(JSON.stringify(deriveDisplayPlan(normalized, []), null, 1) + "\n").toBe(load(name, "display"));
  });

  it("Mid-Week-Start: nur die Meta von Woche 1 ändert sich", () => {
    const golden = JSON.parse(load(name, "normalized"));
    const firstMonday: string = golden.weeks[0].startIso;
    const wednesday = new Date(`${firstMonday}T12:00:00.000Z`);
    wednesday.setUTCDate(wednesday.getUTCDate() + 2);
    const startIso = wednesday.toISOString().slice(0, 10);
    const week1Meta = { wn: 1, phase: "build", label: "Woche 1 · Aufbau", focus: "Einstieg", isRecoveryWeek: true };

    // Wie der Server: Woche 1 unter dem Startdatum statt unter dem Montag.
    const stored = rebuildPlanFromWorkouts({
      workouts: raw(name).workouts,
      metaByWeekStart: new Map<string, WeekV2["meta"]>([[startIso, week1Meta]]),
      weekKeyOverrides: new Map([[firstMonday, startIso]]),
    });
    expect(stored.weeks[0].startIso).toBe(startIso);

    const normalized = normalizeTrainingPlan(stored);
    expect(normalized.workouts).toEqual(golden.workouts);
    expect(normalized.weeks.slice(1)).toEqual(golden.weeks.slice(1));
    expect(normalized.weeks[0]).toEqual({ ...golden.weeks[0], meta: { ...week1Meta, dates: "" } });
  });
});
