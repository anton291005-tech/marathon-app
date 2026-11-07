import { getCoachFeedback, longRunHintThresholdKm } from "./coachFeedback";
import type { PlanWeek, SessionLog } from "./marathonPrediction";
import { freezeTimeForTests } from "./core/time/timeSystem";

const NOW = new Date(2026, 10, 16, 12, 0, 0);

/** Ein Long Run pro Woche, Sonntag, ab dem 1.11.2026; `pastKm` liegen im 42-Tage-Fenster vor NOW, `futureKm` danach. */
function plan(pastKm: number[], futureKm: number[]): PlanWeek[] {
  const all = [...pastKm, ...futureKm];
  return all.map((km, i) => {
    const day = new Date(2026, 10, 1 + i * 7);
    const date = `${day.getDate()}. ${["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][day.getMonth()]}`;
    return {
      wn: i + 1,
      phase: "build",
      km,
      s: [{ id: `lr-${i}`, day: "So", date, type: "long", title: "Long Run", km, desc: "" }],
    } as unknown as PlanWeek;
  });
}

const doneLogs = (p: PlanWeek[], count: number): Record<string, SessionLog> =>
  Object.fromEntries(p.flatMap((w) => w.s).slice(0, count).map((s) => [s.id, { done: true } as SessionLog]));

const hintsFor = (p: PlanWeek[], logs: Record<string, SessionLog>, raceDistanceKm: number | null) =>
  getCoachFeedback({ plan: p, logs, consistencyStats: { weeklyStreak: 0, sessionStreak: 0 }, raceDistanceKm, now: NOW }).filter(
    (h) => h.includes("Long Run"),
  );

beforeAll(() => freezeTimeForTests(NOW));
afterAll(() => freezeTimeForTests(null));

describe("Long-Run-Hinweis (Schwelle aus dem Plan, nur Marathon)", () => {
  it("Schwelle: min(28, längster geplanter Long Run); kein Marathon oder kein Long Run → null", () => {
    expect(longRunHintThresholdKm(plan([18, 20], [24, 32]), 42.2)).toBe(28);
    expect(longRunHintThresholdKm(plan([18, 20], [24, 27]), 42.195)).toBe(27);
    expect(longRunHintThresholdKm(plan([18, 20], [24, 27]), 21.1)).toBeNull();
    expect(longRunHintThresholdKm(plan([18], [20]), null)).toBeNull();
    expect(longRunHintThresholdKm([], 42.2)).toBeNull();
  });

  it("HM-Plan mit Long Run 20 km: kein Hinweis", () => {
    const p = plan([16, 18, 20], [20]);
    expect(hintsFor(p, doneLogs(p, 3), 21.1)).toEqual([]);
  });

  it("Marathon mit Long-Run-Peak 27 km, längster gelaufener 27 km: kein Hinweis", () => {
    const p = plan([23, 25, 27], [20]);
    expect(hintsFor(p, doneLogs(p, 3), 42.2)).toEqual([]);
  });

  it("Marathon mit Peak 32 km, bisher nur unter 28 km gelaufen: Hinweis mit 28 km", () => {
    const p = plan([22, 24, 26], [30, 32]);
    expect(hintsFor(p, doneLogs(p, 3), 42.2)).toEqual([
      "Deine Long Runs liegen noch unter 28 km — für die Marathonbasis lohnt sich mehr Distanz.",
    ]);
  });

  it("Marathon mit Peak 27 km: geplanter 27er im Fenster nicht gelaufen → Hinweis mit 27 km", () => {
    const p = plan([23, 25, 27], [20]);
    expect(hintsFor(p, doneLogs(p, 2), 42.2)).toEqual(["Dir fehlt aktuell ein abgeschlossener Long Run ab 27 km im 42-Tage-Fenster."]);
  });

  it("ohne Distanz (alter Aufrufer): kein Long-Run-Hinweis", () => {
    const p = plan([22, 24, 26], [30, 32]);
    expect(hintsFor(p, doneLogs(p, 3), null)).toEqual([]);
  });
});
