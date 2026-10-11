import { fireEvent, render, screen } from "@testing-library/react";
import { AccountDeleteDialog, isAccountDeleteConfirmed } from "./AccountDeleteDialog";

function setup(props: Partial<React.ComponentProps<typeof AccountDeleteDialog>> = {}) {
  const onCancel = jest.fn();
  const onConfirmDelete = jest.fn();
  render(<AccountDeleteDialog onCancel={onCancel} onConfirmDelete={onConfirmDelete} {...props} />);
  return { onCancel, onConfirmDelete, input: screen.getByLabelText(/Tippe zur Bestätigung LÖSCHEN ein/) };
}

describe("AccountDeleteDialog", () => {
  test("ohne Eingabe ist Löschen gesperrt", () => {
    const { onConfirmDelete } = setup();
    const confirm = screen.getByRole("button", { name: "Konto löschen" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  test("falsches Wort gibt Löschen nicht frei — auch nicht per Enter", () => {
    const { onConfirmDelete, input } = setup();
    fireEvent.change(input, { target: { value: "LOESCHEN" } });
    expect(screen.getByRole("button", { name: "Konto löschen" })).toBeDisabled();
    fireEvent.submit(input);
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  test("LÖSCHEN gibt den Button frei und löst genau einmal aus", () => {
    const { onConfirmDelete, input } = setup();
    fireEvent.change(input, { target: { value: "LÖSCHEN" } });
    const confirm = screen.getByRole("button", { name: "Konto löschen" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  test("Groß-/Kleinschreibung und Leerzeichen am Rand sind egal", () => {
    expect(isAccountDeleteConfirmed(" löschen ")).toBe(true);
    expect(isAccountDeleteConfirmed("Löschen")).toBe(true);
    expect(isAccountDeleteConfirmed("LÖSCHE")).toBe(false);
    expect(isAccountDeleteConfirmed("")).toBe(false);
  });

  test(`nach einem Fehler: Meldung sichtbar, Button heißt „Erneut versuchen“ und löst erneut aus`, () => {
    const { onConfirmDelete, input } = setup({ error: "Konto konnte nicht gelöscht werden." });
    expect(screen.getByRole("alert")).toHaveTextContent("Konto konnte nicht gelöscht werden.");
    fireEvent.change(input, { target: { value: "LÖSCHEN" } });
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  test("während des Löschens ist alles gesperrt", () => {
    const { onCancel, input } = setup({ busy: true });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wird gelöscht…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("Abbrechen schließt den Dialog", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
