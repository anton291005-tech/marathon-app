import "../i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Onboarding } from "./Onboarding";
import { fetchClaudePlanStructure, fetchFullPlanFromClaude } from "../lib/ai/claudePlanService";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { generateMarathonPlanV2ToRace } from "../lib/ai/coachPlanMutations";

jest.mock("../calendar/calendarImportService", () => ({
  calendarIsAvailable: jest.fn(() => false),
  calendarRequestReadAuthorization: jest.fn(async () => false),
}));
jest.mock("../lib/ai/claudePlanService", () => ({
  fetchFullPlanFromClaude: jest.fn(),
  fetchClaudePlanStructure: jest.fn(),
}));
jest.mock("../ai/validation/validateTrainingPlanV2Integrity", () => ({
  validateTrainingPlanV2Integrity: jest.fn(() => true),
}));
jest.mock("../lib/ai/coachPlanMutations", () => ({
  ...jest.requireActual("../lib/ai/coachPlanMutations"),
  generateMarathonPlanV2ToRace: jest.fn(),
}));

const RACE_DATE_LABEL = "Wann ist dein Rennen?";
const FAKE_PLAN = { version: 2, weeks: [], workouts: [{ id: "w1-mo" }] };
const LOCAL_PLAN = { version: 2, weeks: [], workouts: [{ id: "local-w1-mo" }] };

/** Stellvertreter für bestehende Preferences, Patches und Logs — die Fehlerfälle dürfen nichts davon anfassen. */
const SEEDED_STORAGE: Record<string, string> = {
  "test.marathonPreferences": JSON.stringify({ raceDate: "11.04.2027", onboardingComplete: true }),
  "test.planPatches": JSON.stringify([{ id: "patch-1" }]),
  "test.sessionLogs": JSON.stringify([{ id: "log-1" }]),
};

function storageSnapshot(): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)!;
    snapshot[key] = localStorage.getItem(key);
  }
  return snapshot;
}

let storageBefore: Record<string, string | null>;

beforeEach(() => {
  localStorage.clear();
  for (const [key, value] of Object.entries(SEEDED_STORAGE)) localStorage.setItem(key, value);
  (fetchFullPlanFromClaude as jest.Mock).mockReset();
  (fetchClaudePlanStructure as jest.Mock).mockReset();
  // CRA setzt Mock-Implementierungen vor jedem Test zurück (resetMocks) — hier neu setzen.
  (validateTrainingPlanV2Integrity as jest.Mock).mockReturnValue(true);
  (generateMarathonPlanV2ToRace as jest.Mock).mockReturnValue(LOCAL_PLAN);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

/** Schritte 1–4 mit Renndatum, endet auf der Zusammenfassung (Schritt 5); merkt sich den Speicherstand davor. */
function renderAndFinish(onComplete: jest.Mock) {
  render(<Onboarding onComplete={onComplete} />);
  fireEvent.click(screen.getByRole("button", { name: "10 km" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  fireEvent.click(screen.getByRole("button", { name: "0–20 km" }));
  fireEvent.change(screen.getByLabelText(RACE_DATE_LABEL), { target: { value: "01.01.2099" } });
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  }
  storageBefore = storageSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));
}

function expectNothingChanged(onComplete: jest.Mock) {
  expect(onComplete).not.toHaveBeenCalled();
  expect(generateMarathonPlanV2ToRace).not.toHaveBeenCalled();
  expect(screen.queryByText("Dein Plan ist fertig!")).toBeNull();
  expect(storageSnapshot()).toEqual(storageBefore);
}

describe("Onboarding — Server lehnt die Plan-Erzeugung ab", () => {
  it("401: Fehlerphase „Bitte neu anmelden.“, kein Ersatzplan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 401", status: 401 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(await screen.findByText("Bitte neu anmelden.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vereinfachten Plan verwenden" })).toBeNull();
    expect(fetchClaudePlanStructure).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });

  it("429 ohne Wartezeit: Tageslimit-Meldung, kein Ersatzplan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 429", status: 429 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Tageslimit für die Plan-Erzeugung erreicht. Versuch es später wieder."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vereinfachten Plan verwenden" })).toBeNull();
    expect(fetchClaudePlanStructure).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });

  it("429 mit Wartezeit: Meldung nennt die Wartezeit", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({
      plan: null,
      error: "HTTP 429",
      status: 429,
      retryAfterSeconds: 3 * 60 * 60,
    });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Tageslimit für die Plan-Erzeugung erreicht. Versuch es in etwa 3 Stunden wieder."),
    ).toBeInTheDocument();
    expectNothingChanged(onComplete);
  });

  it("400 (Rennen über 52 Wochen entfernt): Renndatum-Meldung, kein Ersatzplan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 400", status: 400 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Das Renndatum liegt zu weit in der Zukunft (max. 52 Wochen)."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vereinfachten Plan verwenden" })).toBeNull();
    expect(fetchClaudePlanStructure).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });
});

describe("Onboarding — Server nicht erreichbar (Netzwerkfehler / 5xx)", () => {
  it("kein stiller Ersatzplan: Fehlerphase mit Angebot „Vereinfachten Plan verwenden“", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 500", status: 500 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Plan konnte nicht erstellt werden. Bitte versuche es erneut."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vereinfachten Plan verwenden" })).toBeInTheDocument();
    expect(fetchClaudePlanStructure).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });

  it("vereinfachter Plan nur nach ausdrücklicher Wahl", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "Failed to fetch" });
    (fetchClaudePlanStructure as jest.Mock).mockResolvedValue({ structure: null, analysis: "", error: "Failed to fetch" });
    const onComplete = jest.fn(async () => undefined);
    renderAndFinish(onComplete);

    fireEvent.click(await screen.findByRole("button", { name: "Vereinfachten Plan verwenden" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ raceDate: "01.01.2099" }),
      LOCAL_PLAN,
      [],
      "10 km – 01.01.2099",
    );
    expect(fetchFullPlanFromClaude).toHaveBeenCalledTimes(1);
  });

  it("vereinfachter Plan gewählt, Struktur-Request liefert 429: Fehlerphase, kein Plan", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 502", status: 502 });
    (fetchClaudePlanStructure as jest.Mock).mockResolvedValue({
      structure: null,
      analysis: "",
      error: "HTTP 429",
      status: 429,
    });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    fireEvent.click(await screen.findByRole("button", { name: "Vereinfachten Plan verwenden" }));

    expect(
      await screen.findByText("Tageslimit für die Plan-Erzeugung erreicht. Versuch es später wieder."),
    ).toBeInTheDocument();
    expectNothingChanged(onComplete);
  });
});

describe("Onboarding — Erfolgsfall unverändert", () => {
  it("Erfolgsanzeige, dann onComplete mit Preferences, Plan und Plan-Name", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN, status: 200 });
    const onComplete = jest.fn(async () => undefined);
    renderAndFinish(onComplete);

    expect(await screen.findByText("Dein Plan ist fertig!")).toBeInTheDocument();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ raceDate: "01.01.2099", onboardingComplete: true }),
      FAKE_PLAN,
      [],
      "10 km – 01.01.2099",
    );
    expect(fetchClaudePlanStructure).not.toHaveBeenCalled();
    expect(generateMarathonPlanV2ToRace).not.toHaveBeenCalled();
  });
});
