// POST /api/onboarding/generate-plan-full mit dem Plan-Kern hinter PLAN_CORE_MODE (Umbauplan Schritt 10).

const { consentFrom } = require("../testSupport/aiConsentAdminMock");
const mockGetUser = jest.fn();
const mockRpc = jest.fn();

jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn() }));
jest.mock("@anthropic-ai/sdk", () => jest.fn());
jest.mock("../../api/_lib/phasedFullPlanGenerator", () => ({ generateFullPlanByPhases: jest.fn() }));
jest.mock("../planCore", () => {
  const actual = jest.requireActual("../planCore");
  return { ...actual, buildCheckedPlan: jest.fn() };
});

const { createClient } = require("@supabase/supabase-js");
const Anthropic = require("@anthropic-ai/sdk");
const { generateFullPlanByPhases } = require("../../api/_lib/phasedFullPlanGenerator");
const planCore = require("../planCore");
const { addDays } = jest.requireActual("../planCore");
const { PROFILES } = require("../planCore/__fixtures__/profiles");
const { wizardProfileOf } = require("../testSupport/planCoreComparison");
const { legacyPlanProfile } = require("../../api/_lib/inputLimits");
const { normalizeTrainingPlan } = require("../planV2/normalizeTrainingPlan");
const { validateTrainingPlanV2Integrity } = require("../ai/validation/validateTrainingPlanV2Integrity");
const route = require("../../api/onboarding/generate-plan-full");

const actualBuild = jest.requireActual("../planCore").buildCheckedPlan;
const LEGACY_PLAN = { version: 2, workouts: [{ id: "legacy-1", dateIso: "2027-03-01T12:00:00.000Z", sport: "run", sessionType: "easy", km: 8 }], weeks: [] };
const USER_MARKER = "ZZ-NUTZER-WUNSCH-5519";

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

const post = (profile) => ({ method: "POST", headers: { authorization: "Bearer aaa.bbb.ccc" }, body: { profile } });

/** P4 (M 4:00, 4 Tage) als Wizard-Profil, mit einem Wunsch als Freitext-Marker. */
const p4 = () => ({ ...wizardProfileOf(PROFILES.find((p) => p.name === "P4").inputs), userPreferences: [`Bitte ${USER_MARKER}`] });

function oldClient(profile) {
  return legacyPlanProfile(profile);
}

let logged;
const coreLogs = () =>
  logged.filter((line) => line.startsWith("[plan-core] ")).map((line) => JSON.parse(line.slice("[plan-core] ".length)));

async function call(profile) {
  const res = mockRes();
  await route(post(profile), res);
  return res;
}

beforeEach(() => {
  process.env.REACT_APP_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  process.env.ANTHROPIC_API_KEY = "test-key-plan-core";
  delete process.env.PLAN_CORE_MODE;
  createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from: consentFrom() }));
  mockRpc.mockResolvedValue({ data: [{ allowed: true, retry_after_seconds: 60 }], error: null });
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  Anthropic.mockImplementation(() => ({ messages: { create: jest.fn() } }));
  generateFullPlanByPhases.mockResolvedValue({ plan: LEGACY_PLAN, diagnostics: {}, totalDurationMs: 5 });
  planCore.buildCheckedPlan.mockImplementation(actualBuild);
  logged = [];
  const capture = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  jest.spyOn(console, "log").mockImplementation(capture);
  jest.spyOn(console, "warn").mockImplementation(capture);
  jest.spyOn(console, "error").mockImplementation(capture);
  jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    logged.push(String(chunk));
    return true;
  });
});

afterAll(() => {
  delete process.env.PLAN_CORE_MODE;
});

describe("PLAN_CORE_MODE off (Standard)", () => {
  test.each([[undefined], [""], ["yes"], ["OFF"]])("Wert %p: heutiger Generator mit gekürztem Profil, Kern rechnet nicht", async (value) => {
    if (value !== undefined) process.env.PLAN_CORE_MODE = value;
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
    expect(generateFullPlanByPhases.mock.calls[0][1]).toEqual(legacyPlanProfile(p4()));
    expect(planCore.buildCheckedPlan).not.toHaveBeenCalled();
    expect(coreLogs()).toEqual([]);
  });
});

describe("PLAN_CORE_MODE on", () => {
  beforeEach(() => {
    process.env.PLAN_CORE_MODE = " On ";
  });

  test("Kern-Plan ohne Claude-Aufruf; Plan besteht Normalisierung und Integrität; kein Freitext im Plan", async () => {
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ source: "plan-core", configVersion: planCore.CONFIG_VERSION });
    expect(generateFullPlanByPhases).not.toHaveBeenCalled();
    expect(Anthropic).not.toHaveBeenCalled();

    const normalized = normalizeTrainingPlan(res.body.plan);
    expect(validateTrainingPlanV2Integrity(normalized)).toBe(true);
    expect(normalized.workouts.length).toBeGreaterThan(0);
    expect(res.body.plan.meta.core.inputs).not.toHaveProperty("freeText");
    expect(JSON.stringify(res.body.plan)).not.toContain(USER_MARKER);

    const [log] = coreLogs();
    expect(log).toMatchObject({ event: "core-plan", mode: "on", errors: 0, configVersion: planCore.CONFIG_VERSION });
    expect(log.metrics).toMatchObject({ weeks: 16, peakWeekKm: 50, longestRunKm: 25, maxRunDaysPerWeek: 4 });
    expect(log).not.toHaveProperty("planCoreFallbacks");
  });

  test("ohne ANTHROPIC_API_KEY liefert der Kern trotzdem", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("plan-core");
  });

  test("alter Client ohne Plan-Eingaben: heutiger Pfad, Ereignis legacy-inputs ohne Rückfall-Zähler", async () => {
    const res = await call(oldClient(p4()));
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
    expect(coreLogs()).toEqual([
      expect.objectContaining({ event: "legacy-inputs", reason: "inputs-missing", fields: ["runDaysPerWeek", "availableDays", "currentWeeklyKm"] }),
    ]);
    expect(coreLogs()[0]).not.toHaveProperty("planCoreFallbacks");
  });

  test("Plan zu kurz (plan-too-short): Rückfall auf den heutigen Generator mit Zähler", async () => {
    const profile = { ...p4(), raceDate: "30.11.2026", planStartDate: "16.11.2026" };
    const res = await call(profile);
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
    expect(generateFullPlanByPhases.mock.calls[0][1]).toEqual(legacyPlanProfile(profile));
    expect(coreLogs()).toEqual([expect.objectContaining({ event: "fallback", reason: "plan-too-short", planCoreFallbacks: 1 })]);
  });

  test("Verstoß (errors > 0): Rückfall; im Log nur Code, Regel, Woche, Schwere", async () => {
    planCore.buildCheckedPlan.mockImplementation((...args) => {
      const real = actualBuild(...args);
      return {
        plan: real.plan,
        check: {
          errors: 1,
          warnings: 2,
          violations: [
            { code: "I9", rule: "step", severity: "error", wn: 3, ymd: "2026-12-13", actual: 31, limit: 28, message: "x" },
            { code: "I11", rule: "e-above-75-percent-long-run", severity: "warning", wn: 4 },
          ],
        },
      };
    });
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
    const [log] = coreLogs();
    expect(log).toMatchObject({ event: "fallback", reason: "invariant", errors: 1, warnings: 2, planCoreFallbacks: 1 });
    expect(log.violations).toEqual([{ code: "I9", rule: "step", wn: 3, severity: "error" }]);
  });

  test("Verstoß und auch der Rückfall scheitert: 500 mit maschinenlesbarem Kern-Code", async () => {
    planCore.buildCheckedPlan.mockImplementation((...args) => ({
      plan: actualBuild(...args).plan,
      check: { errors: 1, warnings: 0, violations: [{ code: "I9", rule: "step", severity: "error", wn: 3 }] },
    }));
    generateFullPlanByPhases.mockRejectedValue(new Error("Anthropic 529 overloaded"));
    const res = await call(p4());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: "plan-core-invariant",
      configVersion: planCore.CONFIG_VERSION,
      errors: 1,
      warnings: 0,
      violations: [{ code: "I9", rule: "step", wn: 3, severity: "error" }],
    });
  });

  test("Verstoß ohne ANTHROPIC_API_KEY: 500 mit Kern-Code statt Key-Meldung", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    planCore.buildCheckedPlan.mockImplementation((...args) => ({
      plan: actualBuild(...args).plan,
      check: { errors: 2, warnings: 0, violations: [] },
    }));
    const res = await call(p4());
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ error: "plan-core-invariant", errors: 2 });
  });

  test("alter Client ohne ANTHROPIC_API_KEY: Meldung wie bisher, kein Kern-Code", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await call(oldClient(p4()));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "ANTHROPIC_API_KEY missing" });
  });

  test("unerwartete Ausnahme im Kern: Rückfall mit Grund exception, Fehlertext nicht im Log", async () => {
    planCore.buildCheckedPlan.mockImplementation(() => {
      throw new Error(`kaputt ${USER_MARKER}`);
    });
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(coreLogs()).toEqual([expect.objectContaining({ event: "fallback", reason: "exception", planCoreFallbacks: 1 })]);
    expect(logged.join("\n")).not.toContain(USER_MARKER);
  });

  test("Wettkampf in der Zukunft: Kern-Plan ohne Rennergebnis, Hinweis im Log", async () => {
    const profile = { ...p4(), recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: "2099-01-01", estimated: false } };
    const res = await call(profile);
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("plan-core");
    expect(res.body.plan.meta.core.inputs).not.toHaveProperty("recentRace");
    expect(coreLogs()[0]).toMatchObject({ event: "core-plan", notes: ["recent-race-date-in-future"] });
  });

  test("Distanz außerhalb des Kerns (z. B. alter Client mit 15 km): Rückfall distance-unsupported", async () => {
    const res = await call({ ...p4(), raceDistanceKm: 15, raceDistanceLabel: "15 km" });
    expect(res.statusCode).toBe(200);
    expect(coreLogs()).toEqual([expect.objectContaining({ event: "fallback", reason: "distance-unsupported", planCoreFallbacks: 1 })]);
  });
});

describe("PLAN_CORE_MODE shadow", () => {
  beforeEach(() => {
    process.env.PLAN_CORE_MODE = "shadow";
  });

  test("Antwort vom heutigen Generator; Log mit Kennzahlen beider Pläne", async () => {
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
    expect(generateFullPlanByPhases).toHaveBeenCalledTimes(1);
    const [log] = coreLogs();
    expect(log).toMatchObject({ event: "shadow", mode: "shadow", status: "ok", errors: 0 });
    expect(log.metrics).toMatchObject({ peakWeekKm: 50 });
    expect(log.legacyMetrics).toMatchObject({ weeks: 1, totalKm: 8 });
    expect(log).not.toHaveProperty("planCoreFallbacks");
  });

  test("Kennzahlen des alten Plans scheitern (ungültiges Datum): der fertige Plan geht trotzdem raus", async () => {
    const broken = { ...LEGACY_PLAN, workouts: [{ ...LEGACY_PLAN.workouts[0], dateIso: "2027-02-30T12:00:00.000Z" }] };
    generateFullPlanByPhases.mockResolvedValue({ plan: broken, diagnostics: {}, totalDurationMs: 5 });
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(broken);
    expect(coreLogs()).toEqual([expect.objectContaining({ event: "shadow", legacyMetrics: null })]);
  });

  test("scheitert der heutige Generator, kommt nie ein Kern-Fehler in die Antwort", async () => {
    planCore.buildCheckedPlan.mockImplementation((...args) => ({
      plan: actualBuild(...args).plan,
      check: { errors: 1, warnings: 0, violations: [] },
    }));
    generateFullPlanByPhases.mockRejectedValue(new Error("boom"));
    const res = await call(p4());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Plan generation failed" });
  });
});

describe("Logs ohne Nutzerinhalte", () => {
  test.each([["on"], ["shadow"]])("Modus %s: kein Freitext, keine Daten des Nutzers im Log", async (mode) => {
    process.env.PLAN_CORE_MODE = mode;
    const profile = { ...p4(), raceDate: "14.03.2027" };
    await call(profile);
    const all = logged.join("\n");
    expect(all).toContain("[plan-core]");
    expect(all).not.toContain(USER_MARKER);
    expect(all).not.toContain("14.03.2027");
    expect(all).not.toContain("2027-03-14");
    expect(all).not.toContain(addDays("2027-03-14", -7 * 15));
  });
});

describe("KI-Einwilligung (Migration 015): Claude-Rückfall nur mit Zustimmung", () => {
  beforeEach(() => {
    process.env.PLAN_CORE_MODE = "on";
  });

  test("Kern-Plan braucht keine Einwilligung", async () => {
    createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from: consentFrom({ granted: false }) }));
    const res = await call(p4());
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("plan-core");
  });

  test("ohne Einwilligung kein Rückfall auf Claude: 500, Client baut den Plan lokal", async () => {
    createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from: consentFrom({ granted: false }) }));
    const res = await call(oldClient(p4()));
    expect(res.statusCode).toBe(500);
    expect(generateFullPlanByPhases).not.toHaveBeenCalled();
    expect(Anthropic).not.toHaveBeenCalled();
    expect(coreLogs().map((l) => l.event)).toContain("no-ai-consent");
  });

  test("Einwilligung nicht lesbar zählt als keine Einwilligung", async () => {
    createClient.mockImplementation(() => ({ auth: { getUser: mockGetUser }, rpc: mockRpc, from: consentFrom({ throws: true }) }));
    const res = await call(oldClient(p4()));
    expect(res.statusCode).toBe(500);
    expect(generateFullPlanByPhases).not.toHaveBeenCalled();
  });

  test("mit Einwilligung bleibt der Rückfall wie bisher", async () => {
    const res = await call(oldClient(p4()));
    expect(res.statusCode).toBe(200);
    expect(res.body.plan).toBe(LEGACY_PLAN);
  });
});

