import type { StoredHealthRun } from "../../healthRuns";
import { stripStravaDerivedLogFields, toRemoteCoachPayload } from "./getAiContext";

const appleRun: StoredHealthRun = {
  runId: "hk_UUID-1",
  startDate: "2026-11-14T07:00:00.000Z",
  duration: 3600,
  distanceMeters: 12000,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Connect",
  avgHeartRateBpm: 148,
};
const stravaRun: StoredHealthRun = {
  runId: "strava:987654321",
  startDate: "2026-11-15T07:00:00.000Z",
  duration: 2777,
  distanceMeters: 9123,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Strava",
  avgHeartRateBpm: 139,
};

function payload(logs: Record<string, unknown>, healthRuns: StoredHealthRun[]) {
  return toRemoteCoachPayload({
    todayIso: "2026-11-16T10:00:00.000Z",
    raceDateIso: null,
    goals: {},
    plan: [],
    logs,
    next14Days: [],
    availableScreens: [],
    settings: {},
    healthRuns,
  } as any);
}

describe("Strava-Daten im Coach-Kontext (Strava API Policy §5.3)", () => {
  test("HealthKit-Workout aus der Strava-App (hk_-ID) ist Apple Health und bleibt", () => {
    const p = payload({}, [{ ...appleRun, runId: "hk_FROM-STRAVA-APP", sourceName: "Strava" }]);
    expect(p.healthRunsLast30Days).toHaveLength(1);
  });

  test("Strava-Läufe fallen aus healthRunsLast30Days, Apple-Health-Läufe bleiben", () => {
    const p = payload({}, [appleRun, stravaRun]);
    expect(p.healthRunsLast30Days).toEqual([
      { workoutType: "running", startDate: "2026-11-14T07:00:00.000Z", duration: 3600, distanceMeters: 12000, avgHeartRateBpm: 148 },
    ]);
  });

  test("Session-Log mit Strava-Lauf: Werte und Auswertung fallen weg, Plan-Status und RPE bleiben", () => {
    const logs = {
      "w2-sa": {
        done: true,
        rpe: 6,
        at: "2026-11-15T08:00:00.000Z",
        assignedRun: { runId: "strava:987654321", distanceKm: 9.12, duration: 2777, avgHeartRateBpm: 139 },
        runEvaluation: { status: "on_target", feedback: "Gut gelaufen", distanceDeltaKm: -0.9 },
      },
      "w2-do": {
        done: true,
        at: "2026-11-14T08:00:00.000Z",
        assignedRun: { runId: "hk_UUID-1", distanceKm: 12, duration: 3600 },
        runEvaluation: { status: "on_target", feedback: "Sauber" },
      },
    };
    const p = payload(logs, [appleRun, stravaRun]);
    const json = JSON.stringify(p);
    expect(json).not.toContain("strava:");
    expect(json).not.toContain("9.12");
    expect(json).not.toContain("2777");
    expect(json).not.toContain("Gut gelaufen");
    expect(p.logsLast30Days).toEqual([
      { sessionId: "w2-do", log: logs["w2-do"] },
      { sessionId: "w2-sa", log: { done: true, rpe: 6, at: "2026-11-15T08:00:00.000Z" } },
    ]);
  });

  test("Vorschlag aus einem Strava-Lauf fällt weg, Apple-Health-Zuordnung bleibt unberührt", () => {
    const suggested = { suggestedHealthRunId: "strava:1", runEvaluation: { status: "short" }, note: "müde" };
    expect(stripStravaDerivedLogFields(suggested)).toEqual({ note: "müde" });
    const untouched = { done: true, assignedRun: { runId: "hk_X", distanceKm: 5 } };
    expect(stripStravaDerivedLogFields(untouched)).toBe(untouched);
    expect(stripStravaDerivedLogFields(null)).toBeNull();
  });
});
