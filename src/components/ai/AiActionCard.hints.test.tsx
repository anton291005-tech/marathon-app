import { render, screen, within } from "@testing-library/react";
import AiActionCard from "./AiActionCard";
import type { AiAssistantAction } from "../../lib/ai/types";

const noop = () => undefined;

function card(preview: AiAssistantAction["preview"]) {
  const action: AiAssistantAction = { type: "reassign_session_to_calendar", payload: {}, preview };
  return render(<AiActionCard action={action} onConfirm={noop} onCancel={noop} onEdit={noop} />);
}

describe("AiActionCard: Hinweis (neutral) und Warnung (⚠️) sind getrennt", () => {
  test("Hinweis erscheint im eigenen Block mit Label 'Hinweis', ohne ⚠️", () => {
    card({ title: "T", items: ["Intervall: Di → Mi (7. Okt)"], hints: ["Nach einem Long Run sind 2 lockere Tage oft sinnvoll."] });
    const block = screen.getByTestId("action-card-hints");
    expect(within(block).getByText("Hinweis")).toBeInTheDocument();
    expect(within(block).getByText(/lockere Tage/)).toBeInTheDocument();
    expect(block.textContent).not.toContain("⚠️");
    expect(screen.getByText("Intervall: Di → Mi (7. Okt)")).toBeInTheDocument();
  });

  test("Warnung steht als ⚠️-Zeile in der Liste, nicht im Hinweis-Block", () => {
    card({ title: "T", items: ["Intervall: Di → Sa (10. Okt)", "⚠️ Harte Einheit direkt vor einem Long Run."] });
    expect(screen.getByText(/⚠️ Harte Einheit/)).toBeInTheDocument();
    expect(screen.queryByTestId("action-card-hints")).toBeNull();
  });

  test("beides zugleich: ⚠️ in der Liste, Hinweis separat darunter", () => {
    card({
      title: "T",
      items: ["Intervall: Di → Sa (10. Okt)", "⚠️ Harte Einheit direkt vor einem Long Run."],
      hints: ["Ein leichter Hinweis."],
    });
    const hints = screen.getByTestId("action-card-hints");
    expect(within(hints).getByText("Ein leichter Hinweis.")).toBeInTheDocument();
    expect(hints.textContent).not.toContain("⚠️");
    expect(screen.getByText(/⚠️ Harte Einheit/).closest('[data-testid="action-card-hints"]')).toBeNull();
  });

  test("leeres hints-Array rendert keinen Block", () => {
    card({ title: "T", items: ["x"], hints: [] });
    expect(screen.queryByTestId("action-card-hints")).toBeNull();
  });
});
