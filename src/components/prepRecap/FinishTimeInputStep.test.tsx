import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FinishTimeInputStep from "./FinishTimeInputStep";

function setup(props: Partial<React.ComponentProps<typeof FinishTimeInputStep>> = {}) {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const onDismiss = jest.fn();
  render(
    <FinishTimeInputStep
      raceName="Warschau Marathon"
      current={{ seconds: 11637, source: "health", confirmed: false }}
      dismissLabel="Überspringen"
      onSubmit={onSubmit}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { onSubmit, onDismiss };
}

function typeTime(h: string, m: string, s: string) {
  fireEvent.change(screen.getByLabelText("Stunden"), { target: { value: h } });
  fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: m } });
  fireEvent.change(screen.getByLabelText("Sekunden"), { target: { value: s } });
}

describe("FinishTimeInputStep", () => {
  it("fragt mit Health-Vorschlag und bestätigt mit einem Tap", async () => {
    const { onSubmit } = setup();
    expect(screen.getByText("Laut Apple Health: 3:13:57 — stimmt das?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stimmt" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ seconds: 11637, source: "health", confirmed: true }));
  });

  it("Ändern speichert eine manuelle, bestätigte Zeit", async () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Zeit ändern" }));
    expect(screen.getByLabelText("Stunden")).toHaveValue("3");
    typeTime("3", "12", "48");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ seconds: 11568, source: "manual", confirmed: true }));
  });

  it("Überspringen bestätigt nichts", () => {
    const { onSubmit, onDismiss } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Überspringen" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ohne Vorschlag: leere Eingabe, Speichern erst bei gültiger Zeit", async () => {
    const { onSubmit } = setup({ current: null });
    expect(screen.getByText("Wie lange warst du unterwegs?")).toBeInTheDocument();
    expect(screen.queryByText(/Laut Apple Health/)).toBeNull();
    const save = screen.getByRole("button", { name: "Speichern" });
    expect(save).toBeDisabled();
    typeTime("3", "75", "00");
    expect(screen.getByRole("alert")).toHaveTextContent("Minuten und Sekunden gehen nur bis 59.");
    expect(save).toBeDisabled();
    typeTime("3", "05", "09");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ seconds: 11109, source: "manual", confirmed: true }));
  });

  it("filtert Nicht-Ziffern", () => {
    setup({ current: null });
    fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: "1a" } });
    expect(screen.getByLabelText("Minuten")).toHaveValue("1");
  });

  it("Bearbeiten einer bestätigten Zeit: vorausgefüllt, unverändert behält die Quelle", async () => {
    const { onSubmit } = setup({
      current: { seconds: 11637, source: "health", confirmed: true },
      startInEdit: true,
      dismissLabel: "Abbrechen",
    });
    expect(screen.getByLabelText("Minuten")).toHaveValue("13");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ seconds: 11637, source: "health", confirmed: true }));
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });

  it("zeigt einen Fehler, wenn das Speichern scheitert", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("offline"));
    render(
      <FinishTimeInputStep
        raceName={null}
        current={{ seconds: 11637, source: "health", confirmed: false }}
        dismissLabel="Überspringen"
        onSubmit={onSubmit}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stimmt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Speichern hat nicht geklappt.");
    expect(screen.getByRole("button", { name: "Stimmt" })).toBeEnabled();
  });
});
