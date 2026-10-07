// Server-Logs (Vercel) dürfen keine Nutzerinhalte enthalten: weder Profil-Freitext, noch die
// Chat-Nachricht, noch den Text der Modellantwort. Erlaubt sind Größen, Zähler, Dauer, Fehlercodes.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-logs-spec";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const {
  generatePlanRulesWithClaude,
  generatePlanStructureWithClaude,
} = require("../../api/_lib/claudePlanGenerator");
const { generateFullPlanByPhases } = require("../../api/_lib/phasedFullPlanGenerator");

const USER_MARKER = "ZZ-NUTZER-FREITEXT-7731";
const MODEL_MARKER = "ZZ-MODELL-ANTWORT-4482";

const profile = () => ({
  raceDistanceKm: 42.195,
  raceDistanceLabel: "Marathon",
  raceGoal: "time",
  raceTargetTime: "3:30:00",
  weeklyKmRange: "40-50",
  raceDate: "11.04.2027",
  planStartDate: "01.03.2027",
  planDurationDays: 41,
  userPreferences: [`Montag kein Training wegen ${USER_MARKER}`],
});

const textReply = (text) => ({ content: [{ type: "text", text }], usage: {} });

describe("Server-Logs ohne Nutzerinhalte", () => {
  let logged;

  beforeEach(() => {
    logged = [];
    const capture = (...args) => {
      logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    jest.spyOn(console, "log").mockImplementation(capture);
    jest.spyOn(console, "warn").mockImplementation(capture);
    jest.spyOn(console, "error").mockImplementation(capture);
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      logged.push(String(chunk));
      return true;
    });
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  function expectCleanLogs() {
    const all = logged.join("\n");
    expect(logged.length).toBeGreaterThan(0);
    expect(all).not.toContain(USER_MARKER);
    expect(all).not.toContain(MODEL_MARKER);
  }

  test("Plan-Regeln (generatePlanRulesWithClaude): Profil und Antwort nicht im Log", async () => {
    mockCreate.mockResolvedValue(textReply(JSON.stringify({ restDays: [1], note: MODEL_MARKER })));
    const rules = await generatePlanRulesWithClaude(profile());
    expect(rules.note).toBe(MODEL_MARKER);
    expectCleanLogs();
  });

  test("Plan-Struktur (generatePlanStructureWithClaude): Profil und Antwort nicht im Log", async () => {
    mockCreate.mockResolvedValue(
      textReply(JSON.stringify({ phases: [{ name: "base", weeks: 6 }], rules: {}, analysis: MODEL_MARKER })),
    );
    const structure = await generatePlanStructureWithClaude(profile());
    expect(structure.analysis).toBe(MODEL_MARKER);
    expectCleanLogs();
  });

  test("Coach-Chat: Nachricht und Antwort nicht im Log", async () => {
    mockCreate.mockResolvedValue(textReply(JSON.stringify({ mode: "coach", message: `Klar. ${MODEL_MARKER}` })));
    const { status, body } = await handleAiCoach({
      input: `Wie plane ich die Woche? ${USER_MARKER}`,
      context: { todayIso: "2026-10-07", recoveryDomain: { homeRecoveryScore0_100: 75 } },
    });
    expect(status).toBe(200);
    expect(body.message).toContain(MODEL_MARKER);
    expectCleanLogs();
  });

  test("Coach-Chat, feste Schutzantwort (Override): Nachricht nicht im Log", async () => {
    const { body } = await handleAiCoach({
      input: `Ich bin total müde, soll ich trotzdem Intervalle laufen? ${USER_MARKER}`,
      context: { todayIso: "2026-10-07", recoveryDomain: { homeRecoveryScore0_100: 75 } },
    });
    expect(body.override).toBe(true);
    expectCleanLogs();
  });

  test("Vollplan mit unlesbarer Modellantwort (Parse-Fehler → Fallback): Antworttext nicht im Log", async () => {
    // Struktur-Aufruf (über den gemockten Anthropic-Konstruktor) und Phasen-Aufrufe (über `client`).
    mockCreate.mockResolvedValue(
      textReply(JSON.stringify({ phases: [{ name: "base", weeks: 6 }], rules: {}, analysis: "ok" })),
    );
    const phaseCreate = jest.fn().mockResolvedValue(textReply(`{"workouts": [ kaputt ${MODEL_MARKER} ${USER_MARKER}`));
    const { plan, diagnostics } = await generateFullPlanByPhases({ messages: { create: phaseCreate } }, profile());
    expect(phaseCreate).toHaveBeenCalled();
    expect(plan.workouts.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).toContain("PARSE ERROR CONTEXT");
    expect(diagnostics).toBeDefined();
    expectCleanLogs();
  });
});
