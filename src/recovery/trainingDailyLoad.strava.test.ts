import type { PlanWeek, SessionLog } from "../marathonPrediction";
import { buildDailyTrainingLoadByDate, logForTrainingLoad } from "./trainingDailyLoad";

const plan = [
  {
    wn: 3,
    s: [
      { id: "w3-mo", type: "easy", title: "Lockerer Dauerlauf", date: "16. Nov", dateIso: "2026-11-16", km: 10 },
      { id: "w3-mi", type: "interval", title: "Intervalle", date: "18. Nov", dateIso: "2026-11-18", km: 9 },
    ],
  },
] as unknown as PlanWeek[];

const assigned = (runId: string) => ({
  runId,
  startDate: "2026-11-16T12:00:00.000Z",
  duration: 4200,
  distanceKm: 14.3,
  avgHeartRateBpm: 158,
});

function load(log: SessionLog | undefined) {
  return buildDailyTrainingLoadByDate(plan, log ? { "w3-mo": log } : {}).get("2026-11-16");
}

describe("Tageslast ohne Strava-Werte (Strava API Policy §5.3)", () => {
  test("Log mit Strava-Zuordnung = dieselbe Last wie ohne Zuordnung (geplante km)", () => {
    const withoutAssignment = load({ done: true });
    const withStrava = load({
      done: true,
      assignedRun: assigned("strava:12000000042"),
      actualKm: "14.3",
      durationMin: 70,
      runEvaluation: { status: "long", distanceDeltaKm: 4.3 },
    });
    expect(withoutAssignment).toBeGreaterThan(0);
    expect(withStrava).toBe(withoutAssignment);
  });

  test("Strava-Zuordnung ohne done-Flag (manuell zugeordnet) zählt weiter als erledigt", () => {
    expect(load({ assignedRun: assigned("strava:1") })).toBe(load({ done: true }));
  });

  test("Apple-Health-Zuordnung wie bisher: Ist-km zählen", () => {
    const withApple = load({ done: true, assignedRun: assigned("hk_UUID") });
    expect(withApple).toBeGreaterThan(load({ done: true }) as number);
    expect(withApple).toBe(load({ done: true, actualKm: "14.3" }));
  });

  test("logForTrainingLoad lässt Apple-Health-Logs unverändert", () => {
    const log: SessionLog = { done: true, assignedRun: assigned("hk_UUID"), actualKm: "14.3" };
    expect(logForTrainingLoad(log)).toBe(log);
    expect(logForTrainingLoad(undefined)).toBeUndefined();
    expect(logForTrainingLoad({ done: true, rpe: 6, assignedRun: assigned("strava:1"), actualKm: "14.3" })).toEqual({ done: true, rpe: 6 });
  });
});
