import "../i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Onboarding, PLAN_INPUTS_REJECTED_MESSAGE, PLAN_INPUTS_REJECTED_TITLE } from "./Onboarding";
import { fetchFullPlanFromClaude } from "../lib/ai/claudePlanService";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { buildLocalCorePlan } from "../onboarding/localCorePlan";
import { RACE_DATE_LABEL, goToSummary } from "../testSupport/onboardingWizard";

jest.mock("../calendar/calendarImportService", () => ({
  calendarIsAvailable: jest.fn(() => false),
  calendarRequestReadAuthorization: jest.fn(async () => false),
}));
jest.mock("../lib/ai/claudePlanService", () => ({
  fetchFullPlanFromClaude: jest.fn(),
}));
jest.mock("../ai/validation/validateTrainingPlanV2Integrity", () => ({
  validateTrainingPlanV2Integrity: jest.fn(() => true),
}));
jest.mock("../onboarding/localCorePlan", () => ({ buildLocalCorePlan: jest.fn() }));

const actualBuildLocal = jest.requireActual("../onboarding/localCorePlan").buildLocalCorePlan;
const FAKE_PLAN = { version: 2, weeks: [], workouts: [{ id: "w1-mo" }] };
const SIMPLIFIED_BUTTON = "Vereinfachten Plan verwenden";

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
  // CRA setzt Mock-Implementierungen vor jedem Test zurück (resetMocks) — hier neu setzen.
  (validateTrainingPlanV2Integrity as jest.Mock).mockReturnValue(true);
  (buildLocalCorePlan as jest.Mock).mockImplementation(actualBuildLocal);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

/** Schritte 1–6 mit Renndatum, endet auf der Zusammenfassung (Schritt 7); merkt sich den Speicherstand davor. */
function renderAndFinish(onComplete: jest.Mock, raceDate = "01.01.2099") {
  render(<Onboarding onComplete={onComplete} />);
  goToSummary({ raceDate });
  storageBefore = storageSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));
}

function expectNothingChanged(onComplete: jest.Mock) {
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.queryByText("Dein Plan ist fertig!")).toBeNull();
  expect(storageSnapshot()).toEqual(storageBefore);
}

describe("Onboarding — Server lehnt die Plan-Erzeugung ab", () => {
  it("401: Fehlerphase „Bitte neu anmelden.“, kein lokaler Plan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 401", status: 401 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(await screen.findByText("Bitte neu anmelden.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SIMPLIFIED_BUTTON })).toBeNull();
    expect(buildLocalCorePlan).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });

  it("429 ohne Wartezeit: Tageslimit-Meldung, kein lokaler Plan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 429", status: 429 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Tageslimit für die Plan-Erzeugung erreicht. Versuch es später wieder."),
    ).toBeInTheDocument();
    expect(buildLocalCorePlan).not.toHaveBeenCalled();
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

  it("400 (Rennen über 52 Wochen entfernt): Renndatum-Meldung, kein lokaler Plan, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 400", status: 400 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(
      await screen.findByText("Das Renndatum liegt zu weit in der Zukunft (max. 52 Wochen)."),
    ).toBeInTheDocument();
    expect(buildLocalCorePlan).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);
  });
});

describe("Onboarding — Server nicht erreichbar: Plan aus dem Kern direkt in der App", () => {
  test.each([
    ["5xx", { plan: null, error: "HTTP 500", status: 500 }],
    ["Netzwerkfehler ohne Status", { plan: null, error: "Failed to fetch" }],
    ["Antwort ohne Plan", { plan: null, error: "no plan returned", status: 200 }],
  ])("%s: lokaler Kern-Plan ohne Nachfrage, gleiche Eingaben wie der Server", async (_label, response) => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue(response);
    const onComplete = jest.fn(async () => undefined);
    renderAndFinish(onComplete);

    expect(await screen.findByText("Dein Plan ist fertig!")).toBeInTheDocument();
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(screen.queryByRole("button", { name: SIMPLIFIED_BUTTON })).toBeNull();

    const [profile] = (fetchFullPlanFromClaude as jest.Mock).mock.calls[0];
    expect((buildLocalCorePlan as jest.Mock).mock.calls[0][0]).toEqual(profile);
    const [prefs, plan, patches, name] = (onComplete as jest.Mock).mock.calls[0];
    expect(prefs).toMatchObject({ raceDate: "01.01.2099", onboardingComplete: true });
    expect(plan.meta.core.inputs).toMatchObject({ distance: "10k", runDaysPerWeek: 4, currentWeeklyKm: 15 });
    expect(plan.workouts.every((w: { id: string }) => w.id.startsWith("pc-"))).toBe(true);
    expect(patches).toEqual([]);
    expect(name).toBe("10 km – 01.01.2099");
  });

  it("Server-Plan besteht die Integritätsprüfung nicht: lokaler Kern-Plan", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN, status: 200 });
    (validateTrainingPlanV2Integrity as jest.Mock).mockReturnValue(false);
    const onComplete = jest.fn(async () => undefined);
    renderAndFinish(onComplete);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect((onComplete as jest.Mock).mock.calls[0][1]).not.toBe(FAKE_PLAN);
    expect(buildLocalCorePlan).toHaveBeenCalledTimes(1);
  });

  it("auch lokal nicht möglich: allgemeine Meldung mit „Erneut versuchen“, nichts verändert", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 503", status: 503 });
    (buildLocalCorePlan as jest.Mock).mockReturnValue({ status: "unavailable", reason: "inputs-missing" });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(await screen.findByText("Plan konnte nicht erstellt werden. Bitte versuche es erneut.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Angaben ändern" })).toBeNull();
    expectNothingChanged(onComplete);
  });
});

describe("Onboarding — Kern lehnt die Angaben ab", () => {
  it("500 plan-core-invariant: eigene Meldung, „Angaben ändern“ statt „Erneut versuchen“, kein lokaler Plan", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({
      plan: null,
      error: "HTTP 500",
      status: 500,
      errorCode: "plan-core-invariant",
    });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(await screen.findByRole("heading", { name: PLAN_INPUTS_REJECTED_TITLE })).toBeInTheDocument();
    expect(screen.getByText(PLAN_INPUTS_REJECTED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(buildLocalCorePlan).not.toHaveBeenCalled();
    expectNothingChanged(onComplete);

    fireEvent.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(screen.getByLabelText(RACE_DATE_LABEL)).toHaveValue("01.01.2099");
    expect(screen.getByLabelText("Schritt 2 von 7")).toBeInTheDocument();
  });

  it("lokaler Kern lehnt ab (Verstoß): dieselbe Meldung mit „Angaben ändern“", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "Failed to fetch" });
    (buildLocalCorePlan as jest.Mock).mockReturnValue({ status: "rejected", reason: "invariant", errors: 2 });
    const onComplete = jest.fn();
    renderAndFinish(onComplete);

    expect(await screen.findByRole("heading", { name: PLAN_INPUTS_REJECTED_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Angaben ändern" })).toBeInTheDocument();
    expectNothingChanged(onComplete);
  });
});

describe("Onboarding — Erfolgsfall unverändert", () => {
  it("Erfolgsanzeige, dann onComplete mit Preferences, Server-Plan und Plan-Name; kein lokaler Plan", async () => {
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
    expect(buildLocalCorePlan).not.toHaveBeenCalled();
  });
});
