import { fireEvent, render, screen } from "@testing-library/react";
import { PlanGenerationLoadingScreen } from "./PlanGenerationLoadingScreen";

describe("PlanGenerationLoadingScreen — Abbrechen im Fehlerzustand", () => {
  it("bietet Abbrechen nur mit Handler an", () => {
    const onCancel = jest.fn();
    const { rerender } = render(<PlanGenerationLoadingScreen weekCount={16} phase="error" onRetry={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
    rerender(<PlanGenerationLoadingScreen weekCount={16} phase="error" onRetry={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("während der Erstellung kein Abbrechen", () => {
    render(<PlanGenerationLoadingScreen weekCount={16} phase="loading" onRetry={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull();
  });
});

describe("PlanGenerationLoadingScreen — Fehlerzustand (Plan-Kern Schritt 11)", () => {
  it("kein Angebot „Vereinfachten Plan verwenden“ mehr; Standard: „Erneut versuchen“", () => {
    const onRetry = jest.fn();
    render(<PlanGenerationLoadingScreen weekCount={16} phase="error" onRetry={onRetry} />);
    expect(screen.getByRole("heading", { name: "Etwas ist schiefgelaufen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vereinfachten Plan verwenden" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Angaben ändern" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("Angaben abgelehnt: eigene Überschrift, nur „Angaben ändern“ (und Abbrechen), kein „Erneut versuchen“", () => {
    const onEditInputs = jest.fn();
    render(
      <PlanGenerationLoadingScreen
        weekCount={16}
        phase="error"
        errorTitle="Plan so nicht möglich"
        errorMessage="Mit diesen Angaben …"
        onEditInputs={onEditInputs}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Plan so nicht möglich" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Angaben ändern" }));
    expect(onEditInputs).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });
});
