// Rate Limit je Nutzer (api/_lib/apiQuota.js, Migration 014) und seine Wirkung an den Routen.

const mockGetUser = jest.fn();
const mockRpc = jest.fn();

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
const { API_QUOTAS, consumeApiQuota, isQuotaExempt } = require("../../api/_lib/apiQuota");
const { USER_DATA_TABLES } = require("../../api/_lib/deleteAccount");
const aiRoute = require("../../api/ai");
const planRoute = require("../../api/onboarding/generate-plan");
const planFullRoute = require("../../api/onboarding/generate-plan-full");

const VALID_JWT = "aaa.bbb.ccc";
const USER_ID = "0b1c2d3e-0000-4000-8000-000000000001";

const allowed = () => ({ data: [{ allowed: true, retry_after_seconds: 1200 }], error: null });
const denied = (retry) => ({ data: [{ allowed: false, retry_after_seconds: retry }], error: null });

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

const post = (body) => ({ method: "POST", headers: { authorization: `Bearer ${VALID_JWT}` }, body });

const profile = {
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
const coachBody = { input: "Wie sieht meine Woche aus?", context: { recoveryDomain: {} } };

beforeEach(() => {
  delete process.env.API_QUOTA_EXEMPT_USER_IDS;
  process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.ANTHROPIC_API_KEY = "test-key-quota";
  createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc }));
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockRpc.mockResolvedValue(allowed());
  handleAiCoach.mockResolvedValue({ status: 200, body: { mode: "coach", message: "ok" } });
  generatePlanStructureWithClaude.mockResolvedValue({ phases: [], analysis: "a" });
  generateFullPlanByPhases.mockResolvedValue({ plan: { workouts: [] }, diagnostics: {}, totalDurationMs: 1 });
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("Limits", () => {
  test("Startwerte: Coach 30/h und 150/Tag, Vollplan 5/Tag, Struktur 10/Tag", () => {
    expect(API_QUOTAS).toEqual({
      coach_chat: [
        { windowSeconds: 3600, limit: 30 },
        { windowSeconds: 86400, limit: 150 },
      ],
      plan_full: [{ windowSeconds: 86400, limit: 5 }],
      plan_structure: [{ windowSeconds: 86400, limit: 10 }],
    });
  });

  test("api_usage wird bei der Account-Löschung mit gelöscht", () => {
    expect(USER_DATA_TABLES).toContain("api_usage");
  });
});

describe("consumeApiQuota", () => {
  const admin = { rpc: mockRpc };

  test("unter dem Limit: erlaubt, ein RPC je Fenster mit der verifizierten Nutzer-ID", async () => {
    await expect(consumeApiQuota(admin, USER_ID, "coach_chat")).resolves.toEqual({ allowed: true });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith("consume_api_quota", {
      p_user_id: USER_ID,
      p_bucket: "coach_chat",
      p_limit: 30,
      p_window_seconds: 3600,
    });
    expect(mockRpc).toHaveBeenCalledWith("consume_api_quota", {
      p_user_id: USER_ID,
      p_bucket: "coach_chat",
      p_limit: 150,
      p_window_seconds: 86400,
    });
  });

  test("Limit überschritten: abgelehnt mit der Wartezeit aus der Datenbank", async () => {
    mockRpc.mockResolvedValue(denied(4321));
    await expect(consumeApiQuota(admin, USER_ID, "plan_full")).resolves.toEqual({ allowed: false, retryAfterSeconds: 4321 });
  });

  test("ein Fenster voll genügt; die längste Sperre bestimmt die Wartezeit", async () => {
    mockRpc.mockImplementation(async (_fn, args) => (args.p_window_seconds === 3600 ? allowed() : denied(50000)));
    await expect(consumeApiQuota(admin, USER_ID, "coach_chat")).resolves.toEqual({ allowed: false, retryAfterSeconds: 50000 });

    mockRpc.mockImplementation(async (_fn, args) => (args.p_window_seconds === 3600 ? denied(900) : denied(50000)));
    await expect(consumeApiQuota(admin, USER_ID, "coach_chat")).resolves.toEqual({ allowed: false, retryAfterSeconds: 50000 });
  });

  test.each([
    ["RPC meldet Fehler (z. B. Migration 014 fehlt)", async () => ({ data: null, error: { message: "function not found" } })],
    ["RPC wirft (Datenbank nicht erreichbar)", async () => { throw new Error("fetch failed"); }],
    ["RPC liefert eine unerwartete Form", async () => ({ data: [{ foo: 1 }], error: null })],
  ])("Datenbankfehler lässt durch: %s", async (_name, impl) => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockImplementation(impl);
    await expect(consumeApiQuota(admin, USER_ID, "plan_full")).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalled();
  });

  test("Ausnahme per Umgebungsvariable: kein RPC, immer erlaubt", async () => {
    process.env.API_QUOTA_EXEMPT_USER_IDS = ` other-id, ${USER_ID.toUpperCase()} `;
    mockRpc.mockResolvedValue(denied(100));
    expect(isQuotaExempt(USER_ID)).toBe(true);
    expect(isQuotaExempt("someone-else")).toBe(false);
    await expect(consumeApiQuota(admin, USER_ID, "plan_full")).resolves.toEqual({ allowed: true });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("ohne Umgebungsvariable ist niemand ausgenommen", () => {
    expect(isQuotaExempt(USER_ID)).toBe(false);
    process.env.API_QUOTA_EXEMPT_USER_IDS = "   ";
    expect(isQuotaExempt(USER_ID)).toBe(false);
  });

  test("unbekannter Bucket ist ein Programmierfehler", async () => {
    await expect(consumeApiQuota(admin, USER_ID, "nope")).rejects.toThrow("Unknown quota bucket");
  });
});

describe("Limit überschritten an den Routen", () => {
  function expectNoAiCall() {
    expect(handleAiCoach).not.toHaveBeenCalled();
    expect(generatePlanStructureWithClaude).not.toHaveBeenCalled();
    expect(generateFullPlanByPhases).not.toHaveBeenCalled();
    expect(Anthropic).not.toHaveBeenCalled();
  }

  test("POST /api/ai: 429 mit Retry-After und anzeigbarer Coach-Nachricht, kein KI-Aufruf", async () => {
    mockRpc.mockResolvedValue(denied(1500));
    const res = mockRes();
    await aiRoute(post(coachBody), res);
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("1500");
    expect(res.body).toMatchObject({ mode: "support", action: null, error: "Rate limit exceeded", retryAfterSeconds: 1500 });
    expect(res.body.message).toContain("25 Minuten");
    expectNoAiCall();
  });

  test("POST /api/onboarding/generate-plan-full: 429 mit Retry-After, kein KI-Aufruf", async () => {
    mockRpc.mockResolvedValue(denied(7200));
    const res = mockRes();
    await planFullRoute(post({ profile }), res);
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("7200");
    expect(res.body).toEqual({ error: "Rate limit exceeded", retryAfterSeconds: 7200 });
    expect(mockRpc).toHaveBeenCalledWith("consume_api_quota", expect.objectContaining({ p_bucket: "plan_full", p_limit: 5 }));
    expectNoAiCall();
  });

  test("POST /api/onboarding/generate-plan: 429, kein KI-Aufruf", async () => {
    mockRpc.mockResolvedValue(denied(60));
    const res = mockRes();
    await planRoute(post({ profile }), res);
    expect(res.statusCode).toBe(429);
    expect(mockRpc).toHaveBeenCalledWith("consume_api_quota", expect.objectContaining({ p_bucket: "plan_structure", p_limit: 10 }));
    expectNoAiCall();
  });

  test("ohne Token wird nichts gezählt", async () => {
    const res = mockRes();
    await aiRoute({ method: "POST", headers: {}, body: coachBody }, res);
    expect(res.statusCode).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("abgelehnte Eingabe verbraucht kein Kontingent", async () => {
    const res = mockRes();
    await planFullRoute(post({ profile: { ...profile, raceDate: "04.06.2029" } }), res);
    expect(res.statusCode).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test("Datenbankfehler beim Limit: Request läuft trotzdem durch", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockRejectedValue(new Error("fetch failed"));
    const res = mockRes();
    await aiRoute(post(coachBody), res);
    expect(res.statusCode).toBe(200);
    expect(handleAiCoach).toHaveBeenCalledTimes(1);
  });

  test("ausgenommener Account läuft ohne Zähler durch", async () => {
    process.env.API_QUOTA_EXEMPT_USER_IDS = USER_ID;
    mockRpc.mockResolvedValue(denied(100));
    const res = mockRes();
    await planFullRoute(post({ profile }), res);
    expect(res.statusCode).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
