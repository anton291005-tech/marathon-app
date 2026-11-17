// Strava-Import (api/_lib/stravaActivitySync.js, POST /api/strava/sync): Mapping, Laufarten-Filter,
// Pagination, Zeitfenster, Token-/Strava-Fehler und Kontingent. Kein echter Strava-Aufruf: `fetch`,
// Token und Datenbank sind gemockt.

const activities = require("../strava/__fixtures__/stravaAthleteActivities.json");
const { createFakeStravaAdmin, jsonResponse } = require("../testSupport/fakeStravaAdmin");
const {
  FIRST_SYNC_DAYS,
  MAX_PAGES,
  PER_PAGE,
  RESYNC_OVERLAP_HOURS,
  STRAVA_CACHE_MAX_DAYS,
  isStravaRunActivity,
  mapStravaActivityToWorkoutRow,
  syncStravaActivitiesForUser,
  syncWindowStartEpochSeconds,
  secondsUntilNextStravaWindow,
  hasActivityReadScope,
  httpStatusForSyncResult,
} = require("../../api/_lib/stravaActivitySync");

const USER_ID = "0b1c2d3e-0000-4000-8000-000000000001";
const NOW_ISO = "2026-11-16T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const now = () => NOW_MS;
const connected = (extra = {}) => ({ strava_athlete_id: 134815, scope: "read,activity:read_all", ...extra });

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("Laufarten-Filter", () => {
  test("nur Run, TrailRun, VirtualRun – sport_type zuerst, sonst type", () => {
    const kept = activities.filter(isStravaRunActivity).map((a) => a.id);
    expect(kept).toEqual([12000000001, 12000000002, 12000000003, 12000000006]);
    expect(isStravaRunActivity({ type: "Run", sport_type: "Ride" })).toBe(false);
    expect(isStravaRunActivity({ type: "VirtualRun" })).toBe(true);
    expect(isStravaRunActivity({ sport_type: "Hike" })).toBe(false);
    expect(isStravaRunActivity(null)).toBe(false);
  });
});

describe("Mapping Strava → health_workouts", () => {
  test("Lauf mit Puls aus der Fixture", () => {
    expect(mapStravaActivityToWorkoutRow(USER_ID, activities[0])).toEqual({
      user_id: USER_ID,
      source_id: "strava:12000000001",
      workout_type: "running",
      start_time: "2026-11-16T06:30:12.000Z",
      duration_seconds: 3005,
      distance_meters: 10012.4,
      avg_heart_rate: 149,
      calories: null,
      splits: null,
      laps: null,
      gps_stream: null,
      interval_snapshot: null,
    });
  });

  test("keine Karte, kein Gerät, kein Name in der Zeile", () => {
    const row = mapStravaActivityToWorkoutRow(USER_ID, activities[0]);
    const json = JSON.stringify(row);
    for (const forbidden of ["Morgenlauf", "summary_polyline", "garmin_ping", "g1234567"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  test("ohne Puls → null; Distanz 0 → null (unbekannt); Dauer fällt auf elapsed_time zurück", () => {
    expect(mapStravaActivityToWorkoutRow(USER_ID, activities[2]).avg_heart_rate).toBeNull();
    expect(mapStravaActivityToWorkoutRow(USER_ID, activities[5]).distance_meters).toBeNull();
    const noMoving = { ...activities[0], moving_time: 0, elapsed_time: 3100 };
    expect(mapStravaActivityToWorkoutRow(USER_ID, noMoving).duration_seconds).toBe(3100);
  });

  test("Kalorien nur direkt geliefert, kilojoules werden nicht umgerechnet", () => {
    expect(mapStravaActivityToWorkoutRow(USER_ID, { ...activities[0], kilojoules: 700 }).calories).toBeNull();
    expect(mapStravaActivityToWorkoutRow(USER_ID, { ...activities[0], calories: 612.4 }).calories).toBe(612);
  });

  test("Splits nur, wenn sie ohne Zusatzaufruf im Objekt stehen", () => {
    const splits = [{ split: 1, distance: 1000, moving_time: 300 }];
    expect(mapStravaActivityToWorkoutRow(USER_ID, { ...activities[0], splits_metric: splits }).splits).toEqual(splits);
  });

  test("kein Lauf, ohne ID oder ohne Startzeit → null", () => {
    expect(mapStravaActivityToWorkoutRow(USER_ID, activities[3])).toBeNull();
    expect(mapStravaActivityToWorkoutRow(USER_ID, { ...activities[0], id: undefined })).toBeNull();
    expect(mapStravaActivityToWorkoutRow(USER_ID, { ...activities[0], start_date: "kaputt" })).toBeNull();
  });
});

describe("Zeitfenster", () => {
  test("erstes Mal 10 Tage, danach letzter Abgleich minus 72 h, nie weiter als 10 Tage", () => {
    expect(FIRST_SYNC_DAYS).toBe(10);
    expect(RESYNC_OVERLAP_HOURS).toBe(72);
    expect(syncWindowStartEpochSeconds({}, NOW_MS)).toBe(Math.floor((NOW_MS - 10 * 86400000) / 1000));
    const last = "2026-11-15T12:00:00.000Z";
    expect(syncWindowStartEpochSeconds({ last_synced_at: last }, NOW_MS)).toBe(
      Math.floor((Date.parse(last) - 72 * 3600000) / 1000),
    );
    expect(syncWindowStartEpochSeconds({ last_synced_at: "2026-01-01T00:00:00.000Z" }, NOW_MS)).toBe(
      Math.floor((NOW_MS - 10 * 86400000) / 1000),
    );
  });

  test("Wartezeit bis zum nächsten 15-Minuten-Fenster von Strava", () => {
    expect(secondsUntilNextStravaWindow(Date.parse("2026-11-16T12:14:00.000Z"))).toBe(60);
    expect(secondsUntilNextStravaWindow(Date.parse("2026-11-16T12:00:00.000Z"))).toBe(900);
  });

  test("Scope: ohne activity:read gibt es keine Läufe", () => {
    expect(hasActivityReadScope("read,activity:read_all")).toBe(true);
    expect(hasActivityReadScope("read,activity:read")).toBe(true);
    expect(hasActivityReadScope("read")).toBe(false);
    expect(hasActivityReadScope(null)).toBe(true);
  });
});

describe("syncStravaActivitiesForUser", () => {
  test("keine Verbindung → not_connected, kein Strava-Aufruf", async () => {
    const { admin } = createFakeStravaAdmin({ connection: null });
    const fetchImpl = jest.fn();
    const getAccessToken = jest.fn();
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken });
    expect(res).toEqual({ status: "not_connected" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  test("importiert nur Läufe, setzt last_synced_at, Upsert ist idempotent", async () => {
    const { admin, db } = createFakeStravaAdmin({ connection: connected(), nowIso: NOW_ISO });
    const fetchImpl = jest.fn(async () => jsonResponse(200, activities));
    const getAccessToken = jest.fn(async () => "token-abc");

    const first = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken });
    expect(first).toMatchObject({ status: "ok", imported: 4, fetched: 6, skipped: 2 });
    expect(db.workouts.map((w) => w.source_id).sort()).toEqual([
      "strava:12000000001",
      "strava:12000000002",
      "strava:12000000003",
      "strava:12000000006",
    ]);
    expect(db.workouts.every((w) => w.workout_type === "running")).toBe(true);
    expect(db.connection.last_synced_at).toBe(NOW_ISO);
    expect(db.connection.last_sync_status).toBe("ok");

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://www.strava.com/api/v3/athlete/activities");
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.get("page")).toBe("1");
    expect(Number(url.searchParams.get("after"))).toBe(Math.floor((NOW_MS - 10 * 86400000) / 1000));
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer token-abc");

    await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken });
    expect(db.workouts).toHaveLength(4);
    const secondUrl = new URL(fetchImpl.mock.calls[1][0]);
    expect(Number(secondUrl.searchParams.get("after"))).toBe(Math.floor((NOW_MS - 72 * 3600000) / 1000));
  });

  test("Pagination: volle Seite → nächste Seite, höchstens MAX_PAGES", async () => {
    const page = (n) =>
      Array.from({ length: PER_PAGE }, (_, i) => ({
        ...activities[0],
        id: n * 1000 + i,
        start_date: new Date(NOW_MS - (n * 1000 + i) * 60000).toISOString(),
      }));
    const { admin, db } = createFakeStravaAdmin({ connection: connected() });
    const fetchImpl = jest.fn(async (url) => {
      const p = Number(new URL(url).searchParams.get("page"));
      return jsonResponse(200, p === 1 ? page(1) : p === 2 ? page(2).slice(0, 7) : []);
    });
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken: async () => "t" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ status: "ok", imported: 107 });
    expect(db.workouts).toHaveLength(107);

    const always = jest.fn(async (url) => jsonResponse(200, page(Number(new URL(url).searchParams.get("page")))));
    await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: always, now, getAccessToken: async () => "t" });
    expect(always).toHaveBeenCalledTimes(MAX_PAGES);
  });

  test.each([400, 401])("Token-Refresh %i → reconnect_required, Verbindung als getrennt markiert", async (code) => {
    const { admin, db } = createFakeStravaAdmin({ connection: connected() });
    const fetchImpl = jest.fn();
    const err = Object.assign(new Error(`Strava token refresh HTTP ${code}`), { status: code });
    const res = await syncStravaActivitiesForUser({
      admin,
      userId: USER_ID,
      fetchImpl,
      now,
      getAccessToken: async () => {
        throw err;
      },
    });
    expect(res).toEqual({ status: "reconnect_required" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.connection.disconnected_at).toBe(NOW_ISO);
    expect(db.connection.last_sync_status).toBe("reconnect_required");

    // Danach kein weiterer Versuch gegen Strava, bis neu verbunden wurde.
    const getAccessToken = jest.fn();
    const again = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken });
    expect(again).toEqual({ status: "reconnect_required" });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  test("Aktivitäten 401 (Zugriff in Strava entzogen) → reconnect_required", async () => {
    const { admin, db } = createFakeStravaAdmin({ connection: connected() });
    const fetchImpl = jest.fn(async () => jsonResponse(401, { message: "Authorization Error" }));
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken: async () => "t" });
    expect(res).toEqual({ status: "reconnect_required" });
    expect(db.connection.disconnected_at).toBe(NOW_ISO);
    expect(db.workouts).toHaveLength(0);
  });

  test("Strava 429 → rate_limited mit retryAfter, nichts geschrieben, Zugriff bleibt", async () => {
    const { admin, db } = createFakeStravaAdmin({ connection: connected() });
    const fetchImpl = jest.fn(async () => jsonResponse(429, { message: "Rate Limit Exceeded" }));
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken: async () => "t" });
    expect(res).toEqual({ status: "rate_limited", retryAfter: 900 });
    expect(db.connection.disconnected_at).toBeUndefined();
    expect(db.connection.last_sync_status).toBe("rate_limited");
    expect(db.workouts).toHaveLength(0);

    const withHeader = jest.fn(async () => jsonResponse(429, {}, { "retry-after": "120" }));
    const res2 = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: withHeader, now, getAccessToken: async () => "t" });
    expect(res2).toEqual({ status: "rate_limited", retryAfter: 120 });
  });

  test("Refresh 429 → rate_limited; anderer Fehler → error", async () => {
    const { admin } = createFakeStravaAdmin({ connection: connected() });
    const throwing = (status) => async () => {
      throw Object.assign(new Error("x"), { status });
    };
    await expect(
      syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: jest.fn(), now, getAccessToken: throwing(429) }),
    ).resolves.toEqual({ status: "rate_limited", retryAfter: 900 });
    await expect(
      syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: jest.fn(), now, getAccessToken: throwing(500) }),
    ).resolves.toEqual({ status: "error" });
    const serverError = jest.fn(async () => jsonResponse(503, {}));
    await expect(
      syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: serverError, now, getAccessToken: async () => "t" }),
    ).resolves.toEqual({ status: "error" });
  });

  test("Scope ohne activity:read → reconnect_required ohne Strava-Aufruf", async () => {
    const { admin } = createFakeStravaAdmin({ connection: connected({ scope: "read" }) });
    const getAccessToken = jest.fn();
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: jest.fn(), now, getAccessToken });
    expect(res).toEqual({ status: "reconnect_required" });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  test("ohne Migration 024: Import läuft trotzdem (10 Tage), Status wird nicht gespeichert", async () => {
    const { admin, db } = createFakeStravaAdmin({ connection: connected(), syncColumns: false });
    const fetchImpl = jest.fn(async () => jsonResponse(200, activities));
    const res = await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl, now, getAccessToken: async () => "t" });
    expect(res).toMatchObject({ status: "ok", imported: 4 });
    expect(db.workouts).toHaveLength(4);
    expect(db.calls.some((c) => c.op === "update")).toBe(false);
    expect(Number(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("after"))).toBe(
      Math.floor((NOW_MS - 10 * 86400000) / 1000),
    );

    const refreshFails = await syncStravaActivitiesForUser({
      admin,
      userId: USER_ID,
      fetchImpl,
      now,
      getAccessToken: async () => {
        throw Object.assign(new Error("x"), { status: 400 });
      },
    });
    expect(refreshFails).toEqual({ status: "reconnect_required" });
  });

  test("7-Tage-Cache: ältere Strava-Zeilen werden gelöscht, Apple-Health-Zeilen bleiben", async () => {
    const old = new Date(NOW_MS - (STRAVA_CACHE_MAX_DAYS + 1) * 86400000).toISOString();
    const fresh = new Date(NOW_MS - 86400000).toISOString();
    const { admin, db } = createFakeStravaAdmin({
      connection: connected(),
      workouts: [
        { user_id: USER_ID, source_id: "strava:1", created_at: old },
        { user_id: USER_ID, source_id: "strava:2", created_at: fresh },
        { user_id: USER_ID, source_id: "hk_ABC", created_at: old },
        { user_id: "other-user", source_id: "strava:3", created_at: old },
      ],
    });
    await syncStravaActivitiesForUser({ admin, userId: USER_ID, fetchImpl: async () => jsonResponse(200, []), now, getAccessToken: async () => "t" });
    expect(db.workouts.map((w) => w.source_id).sort()).toEqual(["hk_ABC", "strava:2", "strava:3"]);
  });

  test("HTTP-Status: Fachzustände 200, Fehler 502", () => {
    expect(httpStatusForSyncResult({ status: "ok" })).toBe(200);
    expect(httpStatusForSyncResult({ status: "reconnect_required" })).toBe(200);
    expect(httpStatusForSyncResult({ status: "rate_limited", retryAfter: 60 })).toBe(200);
    expect(httpStatusForSyncResult({ status: "not_connected" })).toBe(200);
    expect(httpStatusForSyncResult({ status: "error" })).toBe(502);
  });
});
