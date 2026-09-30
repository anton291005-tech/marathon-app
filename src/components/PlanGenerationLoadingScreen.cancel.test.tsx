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
