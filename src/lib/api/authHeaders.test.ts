import { getApiAuthHeaders } from "./authHeaders";
import { supabase } from "../supabase/client";
import { runCoachAgent } from "../ai/coachAgent";
import { fetchClaudePlanStructure, fetchFullPlanFromClaude, type PlanGenerationProfile } from "../ai/claudePlanService";

jest.mock("../supabase/client", () => ({ supabase: { auth: { getSession: jest.fn() } } }));

const getSession = supabase.auth.getSession as jest.Mock;

const profile: PlanGenerationProfile = {
  raceDistanceKm: 42.195,
  raceDistanceLabel: "Marathon",
  raceGoal: "time",
  raceTargetTime: "3:30:00",
  weeklyKmRange: "40-50",
  raceDate: "2027-04-11",
  planStartDate: "2026-12-07",
  planDurationDays: 125,
  userPreferences: [],
};

function headersOfCall(fetchMock: jest.Mock, urlPart: string): Record<string, string> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes(urlPart));
  if (!call) throw new Error(`no fetch call for ${urlPart}`);
  return call[1].headers;
}

describe("getApiAuthHeaders", () => {
  test("mit Session: Bearer-Header", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "aaa.bbb.ccc" } }, error: null });
    await expect(getApiAuthHeaders()).resolves.toEqual({ Authorization: "Bearer aaa.bbb.ccc" });
  });

  test("ohne Session: leeres Objekt", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(getApiAuthHeaders()).resolves.toEqual({});
  });

  test("getSession wirft: leeres Objekt statt Fehler", async () => {
    getSession.mockRejectedValue(new Error("storage unavailable"));
    await expect(getApiAuthHeaders()).resolves.toEqual({});
  });
});

describe("Client sendet das Token an die eigenen Endpunkte", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: "aaa.bbb.ccc" } }, error: null });
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ mode: "coach", message: "Alles im Plan.", structure: null, plan: null }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("runCoachAgent → POST /api/ai", async () => {
    await runCoachAgent("Wie sieht meine Woche aus?", { recoveryDomain: { domainKind: "initial" } });
    expect(headersOfCall(fetchMock, "/api/ai")).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer aaa.bbb.ccc",
    });
  });

  test("fetchClaudePlanStructure → POST /api/onboarding/generate-plan", async () => {
    await fetchClaudePlanStructure(profile);
    expect(headersOfCall(fetchMock, "/api/onboarding/generate-plan")).toMatchObject({
      Authorization: "Bearer aaa.bbb.ccc",
    });
  });

  test("fetchFullPlanFromClaude → POST /api/onboarding/generate-plan-full", async () => {
    await fetchFullPlanFromClaude(profile);
    expect(headersOfCall(fetchMock, "/api/onboarding/generate-plan-full")).toMatchObject({
      Authorization: "Bearer aaa.bbb.ccc",
    });
  });

  test("ohne Session geht der Request ohne Authorization raus (Server antwortet 401)", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await fetchFullPlanFromClaude(profile);
    expect(headersOfCall(fetchMock, "/api/onboarding/generate-plan-full")).not.toHaveProperty("Authorization");
  });
});
