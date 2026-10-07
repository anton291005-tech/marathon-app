// Pflicht-Token an den kostenpflichtigen Vercel-Funktionen: ohne gültiges Supabase-Token darf kein
// Request einen KI-Aufruf erreichen.

const mockGetUser = jest.fn();

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@anthropic-ai/sdk", () => jest.fn());
jest.mock("../../api/_lib/coachHandlers", () => ({ handleAiCoach: jest.fn() }));
jest.mock("../../api/_lib/claudePlanGenerator", () => ({
  generatePlanStructureWithClaude: jest.fn(),
  generatePlanRulesWithClaude: jest.fn(),
}));
jest.mock("../../api/_lib/phasedFullPlanGenerator", () => ({ generateFullPlanByPhases: jest.fn() }));

const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const { generatePlanStructureWithClaude } = require("../../api/_lib/claudePlanGenerator");
const { generateFullPlanByPhases } = require("../../api/_lib/phasedFullPlanGenerator");
const aiRoute = require("../../api/ai");
const planRoute = require("../../api/onboarding/generate-plan");
const planFullRoute = require("../../api/onboarding/generate-plan-full");

const VALID_JWT = "aaa.bbb.ccc";

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

function post(body, token) {
  return { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body };
}

const profile = {
  raceDistanceKm: 42.195,
  raceDistanceLabel: "Marathon",
  raceGoal: "time",
  raceTargetTime: "3:30:00",
  weeklyKmRange: "40-50",
  raceDate: "2027-04-11",
  planStartDate: "2026-12-07",
  planDurationDays: 125,
  userPreferences: ["Montag kein Training"],
};

const routes = [
  ["POST /api/ai", aiRoute, { input: "Wie sieht meine Woche aus?", context: { recoveryDomain: {} } }],
  ["POST /api/onboarding/generate-plan", planRoute, { profile }],
  ["POST /api/onboarding/generate-plan-full", planFullRoute, { profile }],
];

function expectNoAiCall() {
  expect(handleAiCoach).not.toHaveBeenCalled();
  expect(generatePlanStructureWithClaude).not.toHaveBeenCalled();
  expect(generateFullPlanByPhases).not.toHaveBeenCalled();
  expect(Anthropic).not.toHaveBeenCalled();
}

describe("kostenpflichtige Routen verlangen ein Supabase-Token", () => {
  beforeEach(() => {
    process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
    process.env.ANTHROPIC_API_KEY = "test-key-route-auth";
    createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser } }));
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    handleAiCoach.mockResolvedValue({ status: 200, body: { mode: "coach", message: "ok" } });
    generatePlanStructureWithClaude.mockResolvedValue({ phases: [], analysis: "a" });
    generateFullPlanByPhases.mockResolvedValue({ plan: { workouts: [] }, diagnostics: {}, totalDurationMs: 1 });
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  test.each(routes)("%s ohne Token: 401, kein KI-Aufruf", async (_name, route, body) => {
    const res = mockRes();
    await route(post(body), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing Authorization bearer token" });
    expect(mockGetUser).not.toHaveBeenCalled();
    expectNoAiCall();
  });

  test.each(routes)("%s mit falschem Token: 401, kein KI-Aufruf", async (_name, route, body) => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });
    const res = mockRes();
    await route(post(body, VALID_JWT), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session" });
    expectNoAiCall();
  });

  test.each(routes)("%s mit Token ohne JWT-Form: 401, Supabase wird nicht gefragt", async (_name, route, body) => {
    const res = mockRes();
    await route(post(body, "kein-jwt"), res);
    expect(res.statusCode).toBe(401);
    expect(mockGetUser).not.toHaveBeenCalled();
    expectNoAiCall();
  });

  test.each(routes)("%s ohne Service-Role-Key: 503, kein KI-Aufruf", async (_name, route, body) => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = mockRes();
    await route(post(body, VALID_JWT), res);
    expect(res.statusCode).toBe(503);
    expectNoAiCall();
  });

  test("POST /api/ai mit gültigem Token: Coach-Handler läuft", async () => {
    const res = mockRes();
    await aiRoute(post(routes[0][2], VALID_JWT), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ mode: "coach", message: "ok" });
    expect(handleAiCoach).toHaveBeenCalledTimes(1);
  });

  test("POST /api/onboarding/generate-plan mit gültigem Token: Struktur-Aufruf läuft", async () => {
    const res = mockRes();
    await planRoute(post({ profile }, VALID_JWT), res);
    expect(res.statusCode).toBe(200);
    expect(generatePlanStructureWithClaude).toHaveBeenCalledTimes(1);
  });

  test("POST /api/onboarding/generate-plan-full mit gültigem Token: Plan-Erzeugung läuft", async () => {
    const res = mockRes();
    await planFullRoute(post({ profile }, VALID_JWT), res);
    expect(res.statusCode).toBe(200);
    expect(generateFullPlanByPhases).toHaveBeenCalledTimes(1);
  });

  test.each(routes)("%s OPTIONS-Preflight bleibt ohne Token erreichbar", async (_name, route) => {
    const res = mockRes();
    await route({ method: "OPTIONS", headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});
