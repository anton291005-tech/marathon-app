import { runCoachAgent } from "./coachAgent";
import { AGENT_WEAK_MESSAGE } from "./agentFallback";
import { fetchClaudePlanStructure, fetchFullPlanFromClaude, type PlanGenerationProfile } from "./claudePlanService";
import { supabase } from "../supabase/client";

jest.mock("../supabase/client", () => ({ supabase: { auth: { getSession: jest.fn() } } }));

const APP_STATE = { recoveryDomain: { domainKind: "initial" } };

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

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
}

beforeEach(() => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { access_token: "aaa.bbb.ccc" } },
    error: null,
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("runCoachAgent — HTTP-Fehler werden benannt statt hinter der Standardzeile versteckt", () => {
  test("401 → „Bitte neu anmelden.“", async () => {
    respondWith(401, { error: "Invalid or expired session" });
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result.message).toBe("Bitte neu anmelden.");
    expect(result.message).not.toContain(AGENT_WEAK_MESSAGE);
  });

  test("503 → „Der Coach ist gerade nicht verfügbar.“", async () => {
    respondWith(503, { error: "Authentication is not configured" });
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result.message).toBe("Der Coach ist gerade nicht verfügbar.");
  });

  test("429 → Server-Text wird unverändert angezeigt", async () => {
    const message =
      "Du hast das Limit für Coach-Anfragen erreicht. In etwa 25 Minuten geht es weiter — dein Plan bleibt bis dahin unverändert nutzbar.";
    respondWith(429, { mode: "support", message, action: null, error: "Rate limit exceeded", retryAfterSeconds: 1500 });
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result.message).toBe(message);
  });

  test("500 mit eigener Coach-Nachricht → Server-Text bleibt", async () => {
    respondWith(500, { mode: "support", message: "Es gab einen internen Fehler beim Coach-Dienst.", action: null });
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result.message).toBe("Es gab einen internen Fehler beim Coach-Dienst.");
  });

  test("Fehlerstatus ohne anzeigbaren Body (502 HTML) → nicht verfügbar, keine Standardzeile", async () => {
    respondWith(502, "<html>Bad Gateway</html>");
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result.message).toBe("Der Coach ist gerade nicht verfügbar.");
  });

  test("Erfolgsantwort unverändert", async () => {
    respondWith(200, { mode: "coach", message: "Alles im Plan." });
    const result = await runCoachAgent("Hallo", APP_STATE);
    expect(result).toMatchObject({ mode: "coach", message: "Alles im Plan." });
  });
});

describe("Plan-Requests geben den HTTP-Status weiter", () => {
  test("fetchFullPlanFromClaude: 401 mit status", async () => {
    respondWith(401, { error: "Invalid or expired session" });
    await expect(fetchFullPlanFromClaude(profile)).resolves.toEqual({ plan: null, error: "HTTP 401", status: 401 });
  });

  test("fetchFullPlanFromClaude: 429 mit Wartezeit aus dem Retry-After-Header", async () => {
    respondWith(429, { error: "Rate limit exceeded" }, { "Retry-After": "7200" });
    await expect(fetchFullPlanFromClaude(profile)).resolves.toEqual({
      plan: null,
      error: "HTTP 429",
      status: 429,
      retryAfterSeconds: 7200,
    });
  });

  test("fetchFullPlanFromClaude: 429 mit Wartezeit aus dem Body", async () => {
    respondWith(429, { error: "Rate limit exceeded", retryAfterSeconds: 600 });
    await expect(fetchFullPlanFromClaude(profile)).resolves.toMatchObject({ status: 429, retryAfterSeconds: 600 });
  });

  test("fetchFullPlanFromClaude: Netzwerkfehler ohne status", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchFullPlanFromClaude(profile);
    expect(result).toEqual({ plan: null, error: "Failed to fetch" });
  });

  test("fetchClaudePlanStructure: 400 und 429 mit status", async () => {
    respondWith(400, { error: "Plan duration exceeds 52 weeks" });
    await expect(fetchClaudePlanStructure(profile)).resolves.toMatchObject({ structure: null, status: 400 });
    respondWith(429, { error: "Rate limit exceeded", retryAfterSeconds: 900 });
    await expect(fetchClaudePlanStructure(profile)).resolves.toMatchObject({
      structure: null,
      status: 429,
      retryAfterSeconds: 900,
    });
  });

  test("fetchClaudePlanStructure: Netzwerkfehler ohne status", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await fetchClaudePlanStructure(profile);
    expect(result.structure).toBeNull();
    expect(result.status).toBeUndefined();
  });
});
