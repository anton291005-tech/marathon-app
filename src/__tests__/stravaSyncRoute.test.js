// POST /api/strava/sync (api/strava/sync.js): Pflicht-Token, eigenes Kontingent `strava_sync`, keine
// KI-Einwilligung; echter Token-Refresh-Pfad (getValidStravaAccessToken) mit gemocktem fetch.
// OAuth-Callback setzt die „getrennt“-Markierung zurück (mit Rückfall ohne Migration 024).

const { createFakeStravaAdmin, jsonResponse } = require("../testSupport/fakeStravaAdmin");

const mockGetUser = jest.fn();
const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));

const { createClient } = require("@supabase/supabase-js");
const syncRoute = require("../../api/strava/sync");
const { handleStravaCallbackRequest } = require("../../api/_lib/stravaService");
const { API_QUOTAS } = require("../../api/_lib/apiQuota");

const VALID_JWT = "aaa.bbb.ccc";
const USER_ID = "0b1c2d3e-0000-4000-8000-000000000001";

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (name, value) => {
    res.headers[name] = value;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.end = () => res;
  return res;
}

function post(token) {
  return { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} };
}

let fake;
let fromSpy;

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.STRAVA_CLIENT_ID = "12345";
  process.env.STRAVA_CLIENT_SECRET = "secret";
  fake = createFakeStravaAdmin({
    connection: {
      strava_athlete_id: 134815,
      scope: "read,activity:read_all",
      access_token: "old",
      refresh_token: "refresh-1",
      expires_at: "2000-01-01T00:00:00.000Z",
    },
  });
  // getValidStravaAccessToken liest und aktualisiert die Tokens über dieselbe Fake-Tabelle.
  fromSpy = jest.fn((table) => fake.admin.from(table));
  createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from: fromSpy }));
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockRpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 60 }], error: null });
  global.fetch = jest.fn();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete global.fetch;
});

describe("POST /api/strava/sync", () => {
  test("Kontingent strava_sync: 30/h und 200/Tag", () => {
    expect(API_QUOTAS.strava_sync).toEqual([
      { windowSeconds: 3600, limit: 30 },
      { windowSeconds: 86400, limit: 200 },
    ]);
  });

  test("ohne Token → 401, kein Strava-Aufruf", async () => {
    const res = mockRes();
    await syncRoute(post(null), res);
    expect(res.statusCode).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("nur POST", async () => {
    const res = mockRes();
    await syncRoute({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  test("eigenes Kontingent, keine KI-Einwilligung gelesen; Kontingent erschöpft → 429 rate_limited", async () => {
    mockRpc.mockResolvedValue({ data: [{ allowed: false, retry_after_seconds: 1800 }], error: null });
    const res = mockRes();
    await syncRoute(post(VALID_JWT), res);
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("1800");
    expect(res.body).toEqual({ status: "rate_limited", retryAfter: 1800 });
    expect(mockRpc).toHaveBeenCalledWith("consume_api_quota", expect.objectContaining({ p_bucket: "strava_sync" }));
    expect(fromSpy).not.toHaveBeenCalledWith("profiles");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("abgelaufener Token: Refresh, dann Import (gemocktes Strava)", async () => {
    global.fetch.mockImplementation(async (url) => {
      if (String(url).startsWith("https://www.strava.com/oauth/token")) {
        return jsonResponse(200, { access_token: "new-token", refresh_token: "refresh-2", expires_at: 4102444800 });
      }
      return jsonResponse(200, [
        { id: 77, sport_type: "Run", type: "Run", start_date: new Date(Date.now() - 3600000).toISOString(), distance: 5000, moving_time: 1500, elapsed_time: 1550 },
      ]);
    });
    const res = mockRes();
    await syncRoute(post(VALID_JWT), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", imported: 1 });
    expect(fake.db.connection.access_token).toBe("new-token");
    expect(fake.db.workouts.map((w) => w.source_id)).toEqual(["strava:77"]);
    const activitiesCall = global.fetch.mock.calls.find(([u]) => String(u).includes("/athlete/activities"));
    expect(activitiesCall[1].headers.Authorization).toBe("Bearer new-token");
  });

  test("Refresh 401 (Zugriff entzogen) → 200 reconnect_required", async () => {
    global.fetch.mockImplementation(async () => jsonResponse(401, { message: "Bad Request", errors: [{ code: "invalid" }] }));
    const res = mockRes();
    await syncRoute(post(VALID_JWT), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "reconnect_required" });
    expect(fake.db.connection.disconnected_at).toEqual(expect.any(String));
  });
});

describe("OAuth-Callback nach Neu-Verbinden", () => {
  function upsertCapture(failWithMissingColumn) {
    const calls = [];
    const admin = {
      auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
      from: () => ({
        upsert: async (row) => {
          calls.push(row);
          if (failWithMissingColumn && "disconnected_at" in row) return { error: { code: "PGRST204", message: "missing column" } };
          return { error: null };
        },
      }),
    };
    return { admin, calls };
  }

  test.each([false, true])("setzt disconnected_at zurück und speichert den erteilten Scope (ohne 024: %s)", async (missing) => {
    const { admin, calls } = upsertCapture(missing);
    createClient.mockImplementation(() => admin);
    global.fetch.mockResolvedValue(
      jsonResponse(200, { access_token: "a", refresh_token: "r", expires_at: 4102444800, athlete: { id: 134815 } }),
    );
    const { redirectUrl } = await handleStravaCallbackRequest({
      query: { code: "c", state: VALID_JWT, scope: "read,activity:read_all" },
    });
    expect(redirectUrl).toBe("myrace://strava-connected?status=connected");
    expect(calls[0]).toMatchObject({ disconnected_at: null, last_sync_status: null, scope: "read,activity:read_all" });
    if (missing) {
      expect(calls).toHaveLength(2);
      expect(calls[1]).not.toHaveProperty("disconnected_at");
    } else {
      expect(calls).toHaveLength(1);
    }
  });
});
