import "../i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { Onboarding } from "./Onboarding";

jest.mock("../calendar/calendarImportService", () => ({
  calendarIsAvailable: jest.fn(() => false),
  calendarRequestReadAuthorization: jest.fn(async () => false),
}));

describe("Onboarding — Abbrechen (neuer Plan / neue Vorbereitung)", () => {
  it("mit onCancel: Abbrechen verlässt den Wizard, ohne onComplete aufzurufen", () => {
    const onComplete = jest.fn();
    const onCancel = jest.fn();
    render(<Onboarding onComplete={onComplete} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "10 km" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Erst-Onboarding ohne onCancel: kein Abbrechen", () => {
    render(<Onboarding onComplete={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });
});
