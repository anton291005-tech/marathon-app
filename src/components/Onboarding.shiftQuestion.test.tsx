import "../i18n";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Onboarding } from "./Onboarding";
import { freezeTimeForTests } from "../core/time/timeSystem";
import { chooseDistance, clickNext, enterRaceDate } from "../testSupport/onboardingWizard";
import { loadShiftData, resetShiftStateForTests } from "../shift/shiftStore";
import { deleteShiftEntries, loadShiftEntries, upsertShiftEntries } from "../lib/supabase/services/shiftEntriesService";
import { loadShiftProfile, saveShiftProfile } from "../lib/supabase/services/shiftProfileService";

jest.mock("../calendar/calendarImportService", () => ({
  calendarIsAvailable: jest.fn(() => false),
  calendarRequestReadAuthorization: jest.fn(async () => false),
}));
jest.mock("../lib/ai/claudePlanService", () => ({ fetchFullPlanFromClaude: jest.fn() }));
jest.mock("../lib/supabase/services/shiftEntriesService", () => ({
  ...jest.requireActual("../lib/supabase/services/shiftEntriesService"),
  loadShiftEntries: jest.fn(),
  upsertShiftEntries: jest.fn(),
  deleteShiftEntries: jest.fn(),
}));
jest.mock("../lib/supabase/services/shiftProfileService", () => ({
  ...jest.requireActual("../lib/supabase/services/shiftProfileService"),
  loadShiftProfile: jest.fn(),
  saveShiftProfile: jest.fn(),
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, writable: true, value: () => {} });
});

beforeEach(async () => {
  localStorage.clear();
  resetShiftStateForTests();
  (loadShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
  (upsertShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: 0 });
  (deleteShiftEntries as jest.Mock).mockResolvedValue({ status: "ok", value: 0 });
  (loadShiftProfile as jest.Mock).mockResolvedValue({ status: "ok", value: { worksShifts: null, defaults: null } });
  (saveShiftProfile as jest.Mock).mockResolvedValue("ok");
  freezeTimeForTests(new Date(2026, 10, 9, 10, 0, 0));
  jest.spyOn(console, "log").mockImplementation(() => {});
  await act(async () => {
    await loadShiftData("user-1", "2026-11-09");
  });
});

afterEach(() => freezeTimeForTests(null));

function toTrainingWeek() {
  chooseDistance("10 km");
  enterRaceDate("01.01.2099");
  clickNext();
}

describe("Onboarding: Frage nach Schichtarbeit nach den Lauftagen", () => {
  it("steht im Schritt „Deine Trainingswoche“ und blockiert Weiter nicht", () => {
    render(<Onboarding onComplete={jest.fn()} userId="user-1" />);
    toTrainingWeek();
    expect(screen.getByRole("heading", { name: "Deine Trainingswoche" })).toBeInTheDocument();
    expect(screen.getByTestId("shift-wizard-question")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ja" }));
    expect(screen.getByRole("button", { name: "Dienstplan jetzt eintragen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Später" })).toBeInTheDocument();
  });

  it("ohne Konto (userId) keine Frage", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    toTrainingWeek();
    expect(screen.queryByTestId("shift-wizard-question")).toBeNull();
  });
});
