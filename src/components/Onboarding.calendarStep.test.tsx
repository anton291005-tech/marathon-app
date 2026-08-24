import "../i18n";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Onboarding } from "./Onboarding";

jest.mock("../calendar/calendarImportService", () => ({
  calendarIsAvailable: jest.fn(() => false),
  calendarRequestReadAuthorization: jest.fn(async () => false),
}));
jest.mock("../lib/supabase/services/weeklyScheduleBlocksService", () => {
  const actual = jest.requireActual("../lib/supabase/services/weeklyScheduleBlocksService");
  return {
    ...actual,
    insertPresetBlocks: jest.fn(async () => ({ ok: true, insertedCount: 5 })),
  };
});

import { calendarIsAvailable } from "../calendar/calendarImportService";
import { insertPresetBlocks } from "../lib/supabase/services/weeklyScheduleBlocksService";

beforeEach(() => {
  localStorage.clear();
  (calendarIsAvailable as jest.Mock).mockReturnValue(false);
  (insertPresetBlocks as jest.Mock).mockResolvedValue({ ok: true, insertedCount: 5 });
});

/** Navigiert die Schritte 1–3 (Distanz wählen → Umfang wählen → Präferenzen). */
function fillStepsOneToThree(skipPreferencesViaLink: boolean) {
  fireEvent.click(screen.getByRole("button", { name: "10 km" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

  fireEvent.click(screen.getByRole("button", { name: "0–20 km" }));
  fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

  if (skipPreferencesViaLink) {
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
  }
}

describe("Onboarding — Schritt 4 (Kalender verbinden)", () => {
  it("zeigt 5 Fortschritts-Segmente und erreicht den Kalender-Schritt über Weiter", () => {
    render(<Onboarding onComplete={jest.fn()} userId={null} />);

    expect(screen.getByLabelText("Schritt 1 von 5")).toBeInTheDocument();

    fillStepsOneToThree(false);

    expect(screen.getByRole("heading", { name: "Kalender verbinden" })).toBeInTheDocument();
  });

  it("'Überspringen' in Schritt 3 landet auf dem Kalender-Schritt, nicht auf der Summary", () => {
    render(<Onboarding onComplete={jest.fn()} userId={null} />);

    fillStepsOneToThree(true);

    expect(screen.getByRole("heading", { name: "Kalender verbinden" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fast geschafft" })).not.toBeInTheDocument();
  });

  it("zeigt auf Web (kein iOS) direkt die Preset-Chips statt eines Connect-Buttons", () => {
    render(<Onboarding onComplete={jest.fn()} userId={null} />);
    fillStepsOneToThree(false);

    expect(screen.queryByRole("button", { name: /Kalender verbinden/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vollzeit-Job/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Studium/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schichtarbeit/ })).toBeInTheDocument();
  });

  it("Preset-Klick schreibt Blöcke für den User und bestätigt", async () => {
    render(<Onboarding onComplete={jest.fn()} userId="user-1" />);
    fillStepsOneToThree(false);

    fireEvent.click(screen.getByRole("button", { name: /Vollzeit-Job/ }));

    await waitFor(() => expect(screen.getByText("✓ Wochenrhythmus gespeichert")).toBeInTheDocument());
    const [userId, blocks] = (insertPresetBlocks as jest.Mock).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toMatchObject({ source: "preset", isRecurring: true, category: "job" });
  });

  it("ohne userId schreibt ein Preset-Klick nichts (defensiv)", () => {
    render(<Onboarding onComplete={jest.fn()} userId={null} />);
    fillStepsOneToThree(false);

    fireEvent.click(screen.getByRole("button", { name: /Studium/ }));

    expect(insertPresetBlocks).not.toHaveBeenCalled();
  });

  it("Weiter vom Kalender-Schritt erreicht die Summary (Schritt 5) mit Plan-erstellen-Button", () => {
    render(<Onboarding onComplete={jest.fn()} userId={null} />);
    fillStepsOneToThree(false);

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(screen.getByRole("heading", { name: "Fast geschafft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan erstellen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Weiter" })).not.toBeInTheDocument();
  });

  it("zeigt '✓ Kalender bereits verbunden'-Zustand bei gesetztem Connected-Marker (Re-Onboarding)", () => {
    localStorage.setItem("calendarImportConnected", "1");
    render(<Onboarding onComplete={jest.fn()} userId="user-1" />);
    fillStepsOneToThree(false);

    expect(screen.getByText("✓ Kalender verbunden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vollzeit-Job/ })).not.toBeInTheDocument();
  });
});
