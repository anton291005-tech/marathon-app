import "../i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Onboarding } from "./Onboarding";
import { fetchFullPlanFromClaude } from "../lib/ai/claudePlanService";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { buildLocalCorePlan } from "../onboarding/localCorePlan";
import { chooseDistance, enterRaceDate, goToSummary } from "../testSupport/onboardingWizard";

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

const FAKE_PLAN = { version: 2, weeks: [], workouts: [{ id: "w1-mo" }] };

beforeEach(() => {
  localStorage.clear();
  (fetchFullPlanFromClaude as jest.Mock).mockReset();
  // CRA setzt Mock-Implementierungen vor jedem Test zurück (resetMocks) — hier neu setzen.
  (validateTrainingPlanV2Integrity as jest.Mock).mockReturnValue(true);
  (buildLocalCorePlan as jest.Mock).mockReturnValue({ status: "unavailable", reason: "inputs-missing" });
});

describe("Onboarding — Renndatum ist Pflicht", () => {
  it("ohne Renndatum: Hinweis sichtbar, Schritt 2 blockiert", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    chooseDistance();
    expect(screen.getByText("Bitte Renndatum eingeben.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
  });

  it("mit gültigem Renndatum: Hinweis weg, Schritt 2 frei", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    chooseDistance();
    enterRaceDate("01.01.2099");
    expect(screen.queryByText("Bitte Renndatum eingeben.")).toBeNull();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();
  });
});

describe("Onboarding — Abschluss nur mit Plan", () => {
  it("kein Plan erzeugt: Fehlerphase mit „Erneut versuchen“, kein onComplete, keine Erfolgsanzeige", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: null, error: "HTTP 500" });
    const onComplete = jest.fn();
    render(<Onboarding onComplete={onComplete} />);
    goToSummary();
    fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));

    expect(await screen.findByText("Plan konnte nicht erstellt werden. Bitte versuche es erneut.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByText("Dein Plan ist fertig!")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Speichern scheitert (onComplete wirft): Fehlerphase statt stillem Schließen", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN });
    const onComplete = jest.fn(async () => {
      throw new Error("save failed");
    });
    render(<Onboarding onComplete={onComplete} />);
    goToSummary();
    fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));

    expect(
      await screen.findByText("Plan konnte nicht erstellt werden. Bitte versuche es erneut.", undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Erfolg unverändert: Erfolgsanzeige, dann onComplete mit Preferences, Plan und Plan-Name", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN });
    const onComplete = jest.fn(async () => undefined);
    render(<Onboarding onComplete={onComplete} />);
    goToSummary();
    fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));

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
