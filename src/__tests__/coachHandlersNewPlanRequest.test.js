// Regression (Chrome-Test Schritt 11): „Erstelle mir einen Marathon-Plan“ bekam nach abgeschlossener
// Vorbereitung keine feste Antwort — der Post-Race-Prompt meldet „bereit für eine neue Vorbereitung“ und
// Claude fragte nach Zieldatum/Zielzeit. Die feste Antwort muss vor Claude greifen, in jedem Planzustand.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coachHandlers-new-plan-spec";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const { NEW_PLAN_VIA_SETTINGS_MESSAGE, isNewPlanRequest } = require("../../api/_lib/coachNewPlanRequest");
const fs = require("fs");
const path = require("path");

const weeks = [
  {
    wn: 1,
    phase: "Grundlage",
    km: 40,
    s: [{ id: "w1-di", day: "Di", date: "7. Jul", title: "Lockerer Lauf", km: 8, type: "easy" }],
  },
  {
    wn: 12,
    phase: "Rennwoche",
    km: 55,
    s: [{ id: "w12-so", day: "So", date: "27. Sep", title: "WARSCHAU MARATHON", km: 42.2, type: "race" }],
  },
];

const prepStatus = (focus, raceRun = true) => ({
  status: "completed",
  completedBy: raceRun ? "race_done" : "date_passed",
  raceYmd: "2026-09-27",
  raceName: "Warschau Marathon",
  raceRun,
  result: {
    finishTime: raceRun ? "3:11:15" : null,
    finishTimeSeconds: raceRun ? 11475 : null,
    finishTimeConfirmed: raceRun,
    goal: "Ziel: Sub 2:50",
    goalSeconds: 10200,
    pacePerKm: raceRun ? "4:32 /km" : null,
    distanceKm: 42.195,
  },
  focus,
});

const context = (todayIso, extra = {}) => ({
  todayIso,
  raceDateIso: "2026-09-27T10:00:00.000Z",
  goals: { targetTime: "2:50:00" },
  trainingPlan: { source: "display", weeks },
  recoveryDomain: { homeRecoveryScore0_100: 80 },
  ...extra,
});

const STATES = [
  ["aktiver Plan", context("2026-08-01T08:00:00.000Z")],
  ["Post-Race, Erholung", context("2026-10-03T08:00:00.000Z", { prepStatus: prepStatus("recovery") })],
  ["Post-Race, bereit für neue Vorbereitung", context("2026-11-07T08:00:00.000Z", { prepStatus: prepStatus("ready_for_new_prep") })],
  ["Plan vorbei, kein Rennen bekannt", context("2026-11-07T08:00:00.000Z", { prepStatus: prepStatus("plan_over", false) })],
];

describe("Chat: Plan-Wunsch → feste Antwort", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ content: [{ text: "Wann ist dein Zielrennen und welche Zielzeit hast du?" }] });
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  it.each(STATES)("%s: feste Antwort, kein Claude-Aufruf", async (_label, ctx) => {
    const res = await handleAiCoach({ input: "Erstelle mir einen Marathon-Plan", context: ctx });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: "coach", message: NEW_PLAN_VIA_SETTINGS_MESSAGE });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("greift auch hinter dem vom Client vorangestellten Kontext („Nutzer:“-Zeile)", async () => {
    const ctx = STATES[2][1];
    const res = await handleAiCoach({ input: "Kontext: …\nNutzer: Erstelle mir einen Marathon-Plan", context: ctx });
    expect(res.body.message).toBe(NEW_PLAN_VIA_SETTINGS_MESSAGE);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("andere Fragen nach Plan-Ende gehen weiter an Claude", async () => {
    const res = await handleAiCoach({ input: "Wie geht es weiter?", context: STATES[2][1] });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(res.body.message).not.toBe(NEW_PLAN_VIA_SETTINGS_MESSAGE);
  });

  it("Text: Ziel-Screen, 5/5-Fall und Planzahl stimmen mit der App überein", () => {
    const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
    const max = Number(/MAX_ACTIVE_PLANS\s*=\s*(\d+)/.exec(read("src/lib/supabase/services/trainingPlanService.ts"))[1]);
    const switcher = read("src/components/PlanSwitcher.tsx");
    // Button und Listenüberschrift existieren unter genau diesen Namen; bei max. Plänen ist der Button gesperrt.
    expect(switcher).toContain("+ Neuer Trainingsplan");
    expect(switcher).toContain("Meine Trainingspläne");
    expect(switcher).toMatch(/disabled=\{atMax\}/);
    expect(NEW_PLAN_VIA_SETTINGS_MESSAGE).toContain("Einstellungen → Training → Neuer Trainingsplan");
    expect(NEW_PLAN_VIA_SETTINGS_MESSAGE).toContain(`bis zu ${max} Pläne`);
    expect(NEW_PLAN_VIA_SETTINGS_MESSAGE).toContain("Meine Trainingspläne");
    expect(NEW_PLAN_VIA_SETTINGS_MESSAGE).toContain("lösche dann");
  });

  it("es gibt keine zweite Erkennung mehr (Client-Variante gelöscht)", () => {
    const client = fs.readFileSync(path.join(__dirname, "..", "lib", "ai", "coachDeterministicResponses.ts"), "utf8");
    expect(client).not.toMatch(/marathonPlanCreateIntent|NEW_PLAN_VIA_SETTINGS_MESSAGE/);
  });
});

describe("isNewPlanRequest", () => {
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[!?.,;:()[\]{}"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  it.each([
    "Erstelle mir einen Marathon-Plan",
    "Erstelle mir einen Marathonplan",
    "Kannst du mir einen neuen Trainingsplan erstellen?",
    "Bau mir einen Plan für den Berlin-Marathon",
    "Ich brauche einen neuen Plan",
    "Mach mir einen Halbmarathon-Plan",
    "Generiere einen 10k-Plan für mich",
    "Ich habe am 14. September einen Marathon. Erstelle mir einen Plan ab heute.",
    "Ich möchte einen Plan für einen Halbmarathon",
    "Erstelle mir einen Plan für den Marathon in 16 Wochen",
    "Bau mir einen Marathon-Trainingsplan",
    "Ich will einen Marathon-Plan",
    "Schreib mir einen 10k-Plan",
    "Erstelle mir einen Plan für die Marathonvorbereitung",
    "Kannst du mir einen Marathon Trainingsplan schreiben",
    "Ich bräuchte einen neuen Trainingsplan",
    "Gib mir einen Marathonplan",
    "Mein Marathon ist am Sonntag in 12 Wochen, erstelle mir einen Marathon-Plan ab heute",
    "Kannst du mir einen Trainingsplan machen?",
    "ERSTELLE MIR BITTE EINEN NEUEN MARATHONPLAN!!!",
  ])("erkennt: %s", (text) => {
    expect(isNewPlanRequest(norm(text))).toBe(true);
  });

  it.each([
    "Passe meinen Marathon-Plan an",
    "Mach meinen Plan leichter",
    "Ist mein Marathonplan zu hart?",
    "Erstelle mir einen Plan für heute",
    "Erstelle mir einen Plan für morgen",
    "Erstelle mir einen Plan für nächste Woche",
    "Mach mir einen Krafttrainingsplan",
    "Erstelle mir einen Ernährungsplan für den Marathon",
    "Bau einen Ruhetag in meinen Plan",
    "Wie geht es weiter?",
    "Bau mir einen Trainingsplan für Montag",
    "Mach mir einen Trainingsplan für Sonntag",
    "Mach mir einen Trainingsplan für Montag bis Freitag",
    "Ich brauche einen Trainingsplan für die nächsten drei Tage",
    "Mach mir einen Plan für die letzten 2 Wochen vor dem Marathon",
    "Ich will einen Plan für die letzte Woche vor dem Marathon",
    "Ich brauche einen Plan für die Woche nach dem Marathon",
    "Erstelle mir einen Marathon-Plan für die Woche nach dem Rennen",
    "Mach mir einen Plan für Montag",
    "Schreib mir einen Plan für Dienstag",
    "Bau mir einen Plan für den Rest der Woche",
    "Kannst du mir einen Plan für die nächsten 3 Tage machen",
    "Ich möchte einen neuen Plan für 2 Wochen Urlaub",
    "Ich will wissen ob ein Plan mit 4 Läufen besser ist",
    "Ich will wissen, ob ein Marathon-Plan mit 4 Läufen besser ist",
    "Ich brauche einen Plan B für den Regen",
    "Erstelle mir einen Reha-Plan",
    "Was steht heute in meinem Plan?",
    "Wie sieht mein Plan aus?",
    "Warum ist der Plan so hart?",
  ])("lässt durch: %s", (text) => {
    expect(isNewPlanRequest(norm(text))).toBe(false);
  });
});
