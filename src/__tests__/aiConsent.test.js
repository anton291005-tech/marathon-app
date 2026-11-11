// KI-Einwilligung (Migration 015, api/_lib/aiConsent.js): ohne Zustimmung geht kein Nutzerinhalt an Anthropic.

const { consentFrom } = require("../testSupport/aiConsentAdminMock");
const mockGetUser = jest.fn();
const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@anthropic-ai/sdk", () => jest.fn());
jest.mock("../../api/_lib/coachHandlers", () => ({ handleAiCoach: jest.fn() }));
jest.mock("../../api/_lib/claudePlanGenerator", () => ({
  generatePlanStructureWithClaude: jest.fn(),
  generatePlanRulesWithClaude: jest.fn(),
}));

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const { generatePlanStructureWithClaude } = require("../../api/_lib/claudePlanGenerator");
const {
  AI_CONSENT_VERSION,
  readAiConsent,
  COACH_CONSENT_REQUIRED_BODY,
  COACH_CONSENT_UNAVAILABLE_BODY,
} = require("../../api/_lib/aiConsent");
const { AI_CONSENT_VERSION: CLIENT_VERSION } = require("../features/aiConsent/aiConsentState");
const aiRoute = require("../../api/ai");
const planRoute = require("../../api/onboarding/generate-plan");

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

const post = (body) => ({ method: "POST", headers: { authorization: "Bearer aaa.bbb.ccc" }, body });
const coachBody = { input: "Wie sieht meine Woche aus?", context: { recoveryDomain: {} } };
const planProfile = {
  raceDistanceKm: 42.195,
  raceDistanceLabel: "Marathon",
  raceGoal: "time",
  raceTargetTime: "3:30:00",
  weeklyKmRange: "40-50",
  raceDate: "11.04.2027",
  planStartDate: "07.12.2026",
  planDurationDays: 125,
  userPreferences: [],
};

function useConsent(options) {
  const from = consentFrom(options);
  createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from }));
  return from;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.ANTHROPIC_API_KEY = "test-key-consent";
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockRpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 60 }], error: null });
  handleAiCoach.mockResolvedValue({ status: 200, body: { mode: "coach", message: "ok", action: null } });
  generatePlanStructureWithClaude.mockResolvedValue({ weeks: [] });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("readAiConsent", () => {
  const admin = (options) => ({ from: consentFrom(options) });

  test("Zustimmung mit aktueller Version → granted", async () => {
    await expect(readAiConsent(admin({ granted: true }), "u")).resolves.toEqual({ ok: true, granted: true });
  });

  test("keine Zustimmung, keine Profilzeile oder zu alte Version → nicht granted", async () => {
    await expect(readAiConsent(admin({ granted: false }), "u")).resolves.toEqual({ ok: true, granted: false });
    await expect(readAiConsent(admin({ row: null }), "u")).resolves.toEqual({ ok: true, granted: false });
    const old = { ai_consent_at: "2026-11-01T00:00:00Z", ai_consent_version: AI_CONSENT_VERSION - 1 };
    await expect(readAiConsent(admin({ row: old }), "u")).resolves.toEqual({ ok: true, granted: false });
  });

  test("Datenbankfehler oder fehlende Spalte (vor Migration 015) → nicht lesbar", async () => {
    await expect(readAiConsent(admin({ row: null, error: { code: "42703", message: "column does not exist" } }), "u")).resolves.toEqual({ ok: false });
    await expect(readAiConsent(admin({ throws: true }), "u")).resolves.toEqual({ ok: false });
  });

  test("Client und Server nutzen dieselbe Mindestversion", () => {
    expect(CLIENT_VERSION).toBe(AI_CONSENT_VERSION);
  });
});

describe("POST /api/ai", () => {
  test("mit Einwilligung: Coach wird aufgerufen", async () => {
    useConsent({ granted: true });
    const res = mockRes();
    await aiRoute(post(coachBody), res);
    expect(res.statusCode).toBe(200);
    expect(handleAiCoach).toHaveBeenCalledTimes(1);
  });

  test("ohne Einwilligung: 403 als anzeigbare Coach-Zeile, kein Claude-Aufruf, kein Kontingent verbraucht", async () => {
    useConsent({ granted: false });
    const res = mockRes();
    await aiRoute(post(coachBody), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(COACH_CONSENT_REQUIRED_BODY);
    expect(res.body.message).toMatch(/Anthropic/);
    expect(handleAiCoach).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("Einwilligung nicht lesbar: 503, fail closed", async () => {
    useConsent({ throws: true });
    const res = mockRes();
    await aiRoute(post(coachBody), res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual(COACH_CONSENT_UNAVAILABLE_BODY);
    expect(handleAiCoach).not.toHaveBeenCalled();
  });

  test("ohne Token bleibt es 401 (Token vor Einwilligung)", async () => {
    const from = useConsent({ granted: true });
    const res = mockRes();
    await aiRoute({ method: "POST", headers: {}, body: coachBody }, res);
    expect(res.statusCode).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/onboarding/generate-plan (alter Struktur-Endpunkt, ruft immer Claude)", () => {
  test("ohne Einwilligung: 403, kein Claude-Aufruf", async () => {
    useConsent({ granted: false });
    const res = mockRes();
    await planRoute(post({ profile: planProfile }), res);
    expect(res.statusCode).toBe(403);
    expect(generatePlanStructureWithClaude).not.toHaveBeenCalled();
  });
});

describe("lokaler Express-Server", () => {
  test("/api/ai verlangt dieselbe Einwilligung wie die Vercel-Funktion", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../server/index.js"), "utf8");
    const route = source.slice(source.indexOf('app.post("/api/ai"'), source.indexOf('app.get("/api/strava/auth"'));
    expect(route).toContain('aiConsent: "require"');
    expect(route).toContain("COACH_CONSENT_REQUIRED_BODY");
  });
});
