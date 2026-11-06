import "../i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Onboarding } from "./Onboarding";
import { fetchClaudePlanStructure, fetchFullPlanFromClaude } from "../lib/ai/claudePlanService";
import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { freezeTimeForTests } from "../core/time/timeSystem";
import type { OnboardingPlanInputs } from "../onboarding/onboardingPlanInputs";
import {
  LONGEST_RUN_LABEL,
  WEEKLY_KM_LABEL,
  chooseDistance,
  clickNext,
  enterRaceDate,
  fillTrainingWeek,
} from "../testSupport/onboardingWizard";

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

const FAKE_PLAN = { version: 2, weeks: [], workouts: [{ id: "w1-mo" }] };
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const nextButton = () => screen.getByRole("button", { name: "Weiter" });

/** Das Datumsfeld hängt Ziffern an; ein volles Datum wird erst nach „Entf“ (leeren) ersetzt. */
function replaceDate(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.keyDown(input, { key: "Delete" });
  fireEvent.change(input, { target: { value } });
}

// jsdom kennt Element.scrollTo nicht; die Zeitauswahl (TimePicker) scrollt beim Rendern.
beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, writable: true, value: () => {} });
});

beforeEach(() => {
  localStorage.clear();
  // Montag, 9.11.2026 — „Heute“ ist Trainingsstart.
  freezeTimeForTests(new Date(2026, 10, 9, 10, 0, 0));
  (fetchFullPlanFromClaude as jest.Mock).mockReset();
  (fetchClaudePlanStructure as jest.Mock).mockReset();
  (validateTrainingPlanV2Integrity as jest.Mock).mockReturnValue(true);
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  freezeTimeForTests(null);
});

describe("Onboarding Schritt 1: nur die vier Distanzen des Plan-Kerns", () => {
  it("bietet 5 km, 10 km, Halbmarathon und Marathon an, keine freie Distanz", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    ["5 km", "10 km", "Halbmarathon (21,1 km)", "Marathon (42,2 km)"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "15 km" })).toBeNull();
    expect(screen.queryByLabelText("Oder eigene Distanz eingeben")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("Onboarding Schritt 2: Renndatum unter der Mindest-Planlänge", () => {
  it("10 km ab heute: 6.12. wird abgelehnt mit frühestem Datum, 7.12. geht", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    chooseDistance("10 km");
    enterRaceDate("06.12.2026");
    expect(
      screen.getByText("Für einen 10-km-Plan brauchst du mindestens 5 Trainingswochen. Frühestes Renndatum: Mo, 07.12.2026."),
    ).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    replaceDate("Wann ist dein Rennen?", "07.12.2026");
    expect(screen.queryByText(/Frühestes Renndatum/)).toBeNull();
    expect(nextButton()).toBeEnabled();
  });

  it("Marathon: der Start „Nächsten Montag“ verschiebt das früheste Datum", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    chooseDistance("Marathon (42,2 km)");
    enterRaceDate("01.01.2027");
    expect(screen.queryByText(/Frühestes Renndatum/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Nächsten Montag" }));
    expect(
      screen.getByText("Für einen Marathon-Plan brauchst du mindestens 8 Trainingswochen. Frühestes Renndatum: Mo, 04.01.2027."),
    ).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });
});

function toTrainingWeek(distance = "10 km") {
  chooseDistance(distance);
  enterRaceDate("01.01.2099");
  clickNext();
}

describe("Onboarding Schritt 3: Trainingswoche", () => {
  it("Weiter erst mit Lauftagen; alle Tage vorausgewählt, Long Run Sonntag", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    toTrainingWeek();
    expect(screen.getByRole("heading", { name: "Deine Trainingswoche" })).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"].forEach((day) => {
      expect(pressed(`${day} verfügbar`)).toBe("true");
    });
    expect(pressed("Long Run am Sonntag")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "4 Tage" }));
    expect(nextButton()).toBeEnabled();
  });

  it("weniger verfügbare Tage als Lauftage: Meldung und gesperrt; fällt der Long-Run-Tag weg, springt er auf Samstag", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    toTrainingWeek();
    fireEvent.click(screen.getByRole("button", { name: "5 Tage" }));
    ["Montag", "Dienstag", "Mittwoch"].forEach((day) => fireEvent.click(screen.getByRole("button", { name: `${day} verfügbar` })));
    expect(screen.getByRole("alert")).toHaveTextContent("Wähle mindestens 5 Tage, an denen du laufen kannst.");
    expect(nextButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Montag verfügbar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sonntag verfügbar" }));
    expect(screen.queryByRole("button", { name: "Long Run am Sonntag" })).toBeNull();
    expect(pressed("Long Run am Samstag")).toBe("true");
    expect(nextButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Dienstag verfügbar" }));
    fireEvent.click(screen.getByRole("button", { name: "Long Run am Freitag" }));
    expect(pressed("Long Run am Freitag")).toBe("true");
    expect(nextButton()).toBeEnabled();
  });
});

describe("Onboarding Schritt 4: Form", () => {
  function toForm(distance = "10 km", runDays = 4) {
    toTrainingWeek(distance);
    fillTrainingWeek(runDays);
  }

  it("Wochen-km Pflicht und als Zahl; längster Lauf optional mit Standardwert nach Distanz und Lauftagen", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    toForm("10 km", 4);
    expect(screen.getByRole("heading", { name: "Deine aktuelle Form" })).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(WEEKLY_KM_LABEL), { target: { value: "viel" } });
    expect(screen.getByText("Bitte eine Zahl eingeben, z. B. 25.")).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(WEEKLY_KM_LABEL), { target: { value: "35" } });
    expect(nextButton()).toBeEnabled();
    expect(screen.getByText("Leer lassen: Wir rechnen mit 8 km.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(LONGEST_RUN_LABEL), { target: { value: "50" } });
    expect(screen.getByText("Höchstens 45 km.")).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
  });

  it("Rennergebnis: Schätzung nur 5/10 km; Wettkampf braucht ein Datum, das nicht in der Zukunft liegt", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    toForm();
    fireEvent.change(screen.getByLabelText(WEEKLY_KM_LABEL), { target: { value: "35" } });
    expect(pressed("Keine Angabe")).toBe("true");
    expect(screen.getByText(/Einsteiger-Modus/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wettkampf" }));
    fireEvent.click(screen.getByRole("button", { name: "Rennergebnis Halbmarathon" }));
    expect(nextButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Wann war der Wettkampf?"), { target: { value: "01.12.2026" } });
    expect(screen.getByText("Der Wettkampf muss heute oder in der Vergangenheit liegen.")).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    replaceDate("Wann war der Wettkampf?", "27.09.2026");
    expect(nextButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Schätzung" }));
    expect(screen.queryByRole("button", { name: "Rennergebnis Halbmarathon" })).toBeNull();
    expect(pressed("Rennergebnis 10 km")).toBe("true");
    expect(screen.queryByLabelText("Wann war der Wettkampf?")).toBeNull();
    expect(nextButton()).toBeEnabled();
  });
});

describe("Onboarding: Plan-Eingaben bis zum Server und in die Preferences", () => {
  it("Profil enthält die Plan-Eingaben und die abgeleitete Spanne; Zusammenfassung zeigt sie; onComplete speichert sie", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN });
    const onComplete = jest.fn(async () => undefined);
    render(<Onboarding onComplete={onComplete} />);
    toTrainingWeek("Halbmarathon (21,1 km)");
    fireEvent.click(screen.getByRole("button", { name: "5 Tage" }));
    fireEvent.click(screen.getByRole("button", { name: "Mittwoch verfügbar" }));
    fireEvent.click(screen.getByRole("button", { name: "Long Run am Samstag" }));
    clickNext();
    fireEvent.change(screen.getByLabelText(WEEKLY_KM_LABEL), { target: { value: "35,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Schätzung" }));
    clickNext();
    clickNext();
    clickNext();

    expect(screen.getByRole("heading", { name: "Fast geschafft" })).toBeInTheDocument();
    expect(screen.getByText("5 Tage pro Woche · Mo, Di, Do, Fr, Sa, So")).toBeInTheDocument();
    expect(screen.getByText("Samstag")).toBeInTheDocument();
    expect(screen.getByText("35,5 km")).toBeInTheDocument();
    expect(screen.getByText("Keine Angabe (wir rechnen mit 12 km)")).toBeInTheDocument();
    expect(screen.getByText("Schätzung: 10 km in 0:55:00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));
    await waitFor(() => expect(fetchFullPlanFromClaude).toHaveBeenCalledTimes(1));
    const expectedInputs = {
      runDaysPerWeek: 5,
      availableDays: ["Mo", "Di", "Do", "Fr", "Sa", "So"],
      longRunDay: "Sa",
      currentWeeklyKm: 35.5,
    };
    expect((fetchFullPlanFromClaude as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        raceDistanceKm: 21.1,
        weeklyKmRange: "20–40 km",
        ...expectedInputs,
        longestRecentRunKm: 12,
        longestRecentRunKmIsDefault: true,
        recentRace: { distanceKm: 10, timeSeconds: 3300, dateYmd: null, estimated: true },
      }),
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const [prefs] = (onComplete as jest.Mock).mock.calls[0];
    expect(prefs.weeklyKmRange).toBe("20–40 km");
    expect(prefs.planInputs).toEqual({
      ...expectedInputs,
      longestRecentRunKm: null,
      recentRace: { distanceKm: 10, timeSeconds: 3300, dateYmd: null, estimated: true },
    });
  });

  it("Bestandsnutzer: Werte des letzten Plans sind vorausgefüllt und gehen unverändert durch", async () => {
    (fetchFullPlanFromClaude as jest.Mock).mockResolvedValue({ plan: FAKE_PLAN });
    const lastPlan: OnboardingPlanInputs = {
      runDaysPerWeek: 3,
      availableDays: ["Di", "Do", "Sa", "So"],
      longRunDay: "Sa",
      currentWeeklyKm: 22,
      longestRecentRunKm: 14,
      recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: "2026-09-27", estimated: false },
    };
    const onComplete = jest.fn(async () => undefined);
    render(<Onboarding onComplete={onComplete} initialPlanInputs={lastPlan} />);
    toTrainingWeek("Marathon (42,2 km)");
    expect(screen.getByText("Vorausgefüllt aus deinem letzten Plan — bitte kurz prüfen.")).toBeInTheDocument();
    expect(pressed("3 Tage")).toBe("true");
    expect(pressed("Montag verfügbar")).toBe("false");
    expect(pressed("Long Run am Samstag")).toBe("true");
    expect(nextButton()).toBeEnabled();
    clickNext();

    expect(screen.getByLabelText(WEEKLY_KM_LABEL)).toHaveValue("22");
    expect(screen.getByLabelText(LONGEST_RUN_LABEL)).toHaveValue("14");
    expect(pressed("Wettkampf")).toBe("true");
    expect(screen.getByLabelText("Wann war der Wettkampf?")).toHaveValue("27.09.2026");
    clickNext();
    clickNext();
    clickNext();
    expect(screen.getByText("Halbmarathon in 1:55:00 am 27.09.2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Plan erstellen" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect((onComplete as jest.Mock).mock.calls[0][0].planInputs).toEqual(lastPlan);
    expect((fetchFullPlanFromClaude as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ longestRecentRunKm: 14, longestRecentRunKmIsDefault: false, weeklyKmRange: "20–40 km" }),
    );
  });
});
