import { fireEvent, render, screen } from "@testing-library/react";
import AiActionCard from "./AiActionCard";
import type { AiAssistantAction } from "../../lib/ai/types";

const action = (preview: Record<string, unknown>, type = "reassign_calendar") =>
  ({ type, payload: {}, preview }) as unknown as AiAssistantAction;

describe("AiActionCard", () => {
  test("Änderung als Vorher/Nachher-Zeile, Hinweis als Textzeile, Standard-Buttons deutsch", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <AiActionCard
        action={action({ title: "Trainingstag an Kalender anpassen", items: ["Langer Lauf: Sa → Fr (16. Okt)", "Hinweis: knapp"] })}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("Planänderung")).toBeInTheDocument();
    expect(screen.getByText("Langer Lauf: Sa")).toBeInTheDocument();
    expect(screen.getByText("Fr (16. Okt)")).toBeInTheDocument();
    expect(screen.getByText("Hinweis: knapp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("Navigation: kein Bearbeiten, Beschriftungen aus der Vorschau gewinnen", () => {
    render(
      <AiActionCard
        action={action({ title: "Einstellungen öffnen", items: ["Ziel: Einstellungen"], confirmLabel: "Öffnen", cancelLabel: "Abbrechen" }, "navigate_to_screen")}
        onConfirm={() => {}}
        onCancel={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Öffnen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();
  });
});
