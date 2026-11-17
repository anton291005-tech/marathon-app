/**
 * Ende zu Ende mit gemocktem Strava (kein Netz): Server-Import → `health_workouts` → Client lädt die Zeilen
 * → dieselbe automatische Zuordnung wie für Apple Health → geplante Einheit ist erledigt und hat die
 * Ist-Distanz; derselbe Lauf aus Apple Health und Strava zählt einmal.
 */
import { freezeTimeForTests } from "../core/time/timeSystem";
import { isSessionLogDone } from "../appSmartFeatures";
import { mergeHealthRuns, type StoredHealthRun } from "../healthRuns";
import { pickRpePromptSession } from "../features/session/rpePrompt";
import { dbRowToStoredHealthRun, type DbHealthWorkoutRow } from "../lib/supabase/services/healthWorkoutsService";
import { toRemoteCoachPayload } from "../lib/ai/getAiContext";
import { applyAppleHealthTrainingSync } from "../trainingIntelligence/applyAppleHealthSync";
import { replaceStravaRuns } from "./crossSourceRunDedup";

jest.mock("../lib/supabase/client", () => ({ supabase: {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syncStravaActivitiesForUser } = require("../../api/_lib/stravaActivitySync");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createFakeStravaAdmin, jsonResponse } = require("../testSupport/fakeStravaAdmin");

const USER_ID = "0b1c2d3e-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-16T18:00:00.000Z");
// Mittags UTC: in jeder Zeitzone von UTC−11 bis UTC+11 derselbe Kalendertag.
const RUN_START = "2026-11-16T12:00:00Z";

const planSessions: any[] = [
  { id: "w3-mo", type: "easy", title: "Lockerer Dauerlauf", date: "16. Nov", dateIso: "2026-11-16", km: 10, pace: "5:30/km" },
  { id: "w3-mi", type: "interval", title: "Intervalle", date: "18. Nov", dateIso: "2026-11-18", km: 9 },
];

const stravaActivity = {
  id: 12000000042,
  name: "Feierabendlauf",
  sport_type: "Run",
  type: "Run",
  start_date: RUN_START,
  distance: 10120.5,
  moving_time: 3300,
  elapsed_time: 3420,
  has_heartrate: true,
  average_heartrate: 146.2,
};
const garminRide = { id: 12000000043, sport_type: "Ride", type: "Ride", start_date: RUN_START, distance: 30000, moving_time: 3600 };

async function importFromMockedStrava(): Promise<StoredHealthRun[]> {
  const { admin, db } = createFakeStravaAdmin({
    connection: { strava_athlete_id: 134815, scope: "read,activity:read_all" },
    nowIso: NOW.toISOString(),
  });
  const fetchImpl = jest.fn(async () => jsonResponse(200, [stravaActivity, garminRide]));
  const result = await syncStravaActivitiesForUser({
    admin,
    userId: USER_ID,
    fetchImpl,
    now: () => NOW.getTime(),
    getAccessToken: async () => "token",
  });
  expect(result).toMatchObject({ status: "ok", imported: 1 });
  return (db.workouts as DbHealthWorkoutRow[])
    .map((row) => dbRowToStoredHealthRun(row))
    .filter((r): r is StoredHealthRun => r != null);
}

/** Apple-Health-Kopie desselben Laufs (Garmin Connect → Apple Health): 90 s später gestartet, 1 % längere Distanz. */
const appleCopy: StoredHealthRun = {
  runId: "hk_GARMIN-UUID",
  platformId: "GARMIN-UUID",
  startDate: "2026-11-16T12:01:30.000Z",
  duration: 3415,
  distanceMeters: 10221,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Connect",
  avgHeartRateBpm: 147,
};

beforeEach(() => {
  freezeTimeForTests(NOW);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  freezeTimeForTests(null);
});

describe("Strava-Import Ende zu Ende", () => {
  test("geplante Einheit wird automatisch erledigt und bekommt die Ist-Distanz", async () => {
    const stravaRuns = await importFromMockedStrava();
    expect(stravaRuns).toHaveLength(1);
    expect(stravaRuns[0]).toMatchObject({ runId: "strava:12000000042", sourceName: "Strava", workoutType: "running" });

    const healthRuns = replaceStravaRuns([], stravaRuns);
    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: NOW });

    expect(res.changed).toBe(true);
    const log = res.logs["w3-mo"];
    expect(isSessionLogDone(log)).toBe(true);
    expect(log.done).toBe(true);
    expect(log.assignedRun).toMatchObject({ runId: "strava:12000000042", distanceKm: 10.12, duration: 3300, avgHeartRateBpm: 146 });
    expect(res.logs["w3-mi"]).toBeUndefined();
    // Quelle für das Nutzungsereignis `session_completed`.
    expect(res.completions).toEqual([{ sessionId: "w3-mo", runId: "strava:12000000042", source: "strava" }]);

    // Anstrengungsfrage nach der Einheit wie bei Apple-Health-Läufen.
    const prompt = pickRpePromptSession({ sessions: planSessions, logs: res.logs, todayYmd: "2026-11-16", dismissed: new Set() });
    expect(prompt?.id).toBe("w3-mo");
  });

  test("doppelte Quelle zählt einmal: Apple Health und Strava zugleich → Apple Health", async () => {
    const stravaRuns = await importFromMockedStrava();
    const healthRuns = replaceStravaRuns(mergeHealthRuns([], [appleCopy]), stravaRuns);
    expect(healthRuns.map((r) => r.runId)).toEqual(["hk_GARMIN-UUID"]);

    const res = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: NOW });
    expect(res.logs["w3-mo"].assignedRun).toMatchObject({ runId: "hk_GARMIN-UUID", distanceKm: 10.22 });
    expect(res.completions).toHaveLength(1);
    expect(res.completions[0].source).toBe("apple_health");
  });

  test("Strava kam zuerst, Apple Health später: Zuordnung wechselt auf Apple Health, zählt nicht doppelt", async () => {
    const stravaRuns = await importFromMockedStrava();
    let healthRuns = replaceStravaRuns([], stravaRuns);
    const first = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: NOW });
    const doneAt = first.logs["w3-mo"].at;

    healthRuns = mergeHealthRuns(healthRuns, [appleCopy]);
    expect(healthRuns).toHaveLength(1);
    const second = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: first.logs, now: NOW });

    expect(second.logs["w3-mo"].assignedRun?.runId).toBe("hk_GARMIN-UUID");
    expect(second.logs["w3-mo"].done).toBe(true);
    expect(second.logs["w3-mo"].at).toBe(doneAt);
    expect(second.completions).toEqual([]);
    expect(Object.values(second.logs).filter((l) => l.done)).toHaveLength(1);
  });

  test("Strava-Läufe und ihre Werte erreichen den Coach nicht", async () => {
    const stravaRuns = await importFromMockedStrava();
    const healthRuns = replaceStravaRuns([], stravaRuns);
    const { logs } = applyAppleHealthTrainingSync({ healthRuns, planSessions, logs: {}, now: NOW });
    const payload = toRemoteCoachPayload({
      todayIso: NOW.toISOString(),
      raceDateIso: null,
      goals: {},
      plan: [],
      logs,
      next14Days: [],
      availableScreens: [],
      settings: {},
      healthRuns,
    } as any);
    const json = JSON.stringify(payload);
    expect(payload.healthRunsLast30Days).toEqual([]);
    expect(json).not.toContain("strava:");
    expect(json).not.toContain("10.12");
    expect(json).not.toContain("3300");
    // Plan-Status bleibt (siehe ENTSCHEIDUNG in getAiContext.ts).
    expect(payload.logsLast30Days).toEqual([{ sessionId: "w3-mo", log: expect.objectContaining({ done: true }) }]);
  });
});
