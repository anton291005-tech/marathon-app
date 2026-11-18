import { fireEvent, render, screen } from "@testing-library/react";
import { modalBackgroundProps } from "./modalBackground";

function Shell({ wizardOpen, onDone }: { wizardOpen: boolean; onDone: () => void }) {
  return (
    <div>
      <div data-testid="app" {...modalBackgroundProps(wizardOpen)}>
        <button type="button" onClick={onDone}>
          Einheit erledigen
        </button>
      </div>
      {wizardOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Wizard">
          <button type="button">Weiter</button>
        </div>
      ) : null}
    </div>
  );
}

describe("modalBackgroundProps", () => {
  it("Wizard offen: der Inhalt dahinter ist inert und für Screenreader verborgen", () => {
    render(<Shell wizardOpen onDone={jest.fn()} />);
    const app = screen.getByTestId("app");
    expect(app).toHaveAttribute("inert");
    expect(app).toHaveAttribute("aria-hidden", "true");
    // Über Rollen (wie ein Screenreader) ist nur noch der Wizard erreichbar.
    expect(screen.queryByRole("button", { name: "Einheit erledigen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeInTheDocument();
  });

  it("Wizard zu: keine Attribute, die App ist normal bedienbar", () => {
    const onDone = jest.fn();
    render(<Shell wizardOpen={false} onDone={onDone} />);
    const app = screen.getByTestId("app");
    expect(app).not.toHaveAttribute("inert");
    expect(app).not.toHaveAttribute("aria-hidden");
    fireEvent.click(screen.getByRole("button", { name: "Einheit erledigen" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
