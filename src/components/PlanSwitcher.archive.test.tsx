import { fireEvent, render, screen } from "@testing-library/react";
import type { TrainingPlanListItem } from "../lib/supabase/services/trainingPlanService";
import { PlanSwitcher } from "./PlanSwitcher";

const active: TrainingPlanListItem = {
  id: "p-new",
  plan_slot: 1,
  plan_name: "Marathon – Berlin",
  is_active: true,
  created_at: "2026-10-01T08:00:00Z",
  archived_at: null,
};

const handlers = { onSwitch: jest.fn(), onAddNew: jest.fn(), onDelete: jest.fn() };

describe("PlanSwitcher — abgeschlossene Vorbereitungen", () => {
  it("listet archivierte Pläne getrennt und öffnet ihren Rückblick", () => {
    const onOpenArchived = jest.fn();
    render(
      <PlanSwitcher
        {...handlers}
        plans={[active]}
        archivedPreps={[
          { planId: "p-warschau", name: "Warschau Marathon", dateLabel: "27. September 2026", canOpen: true },
          { planId: "p-alt", name: "Alter Plan", dateLabel: null, canOpen: false },
        ]}
        onOpenArchived={onOpenArchived}
      />,
    );
    // Archivierte zählen nicht gegen das Limit.
    expect(screen.getByText("Meine Trainingspläne (1/5)")).toBeInTheDocument();
    expect(screen.getByText("Abgeschlossene Vorbereitungen")).toBeInTheDocument();
    expect(screen.getByText("27. September 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rückblick Warschau Marathon ansehen" }));
    expect(onOpenArchived).toHaveBeenCalledWith("p-warschau");
    // Ohne gespeicherten Rückblick kein Öffnen; archivierte Pläne sind weder aktivier- noch löschbar.
    expect(screen.queryByRole("button", { name: "Rückblick Alter Plan ansehen" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Warschau Marathon (aktivieren|löschen)/ })).toBeNull();
  });

  it("ohne Archiv keine Unterliste", () => {
    render(<PlanSwitcher {...handlers} plans={[active]} />);
    expect(screen.queryByTestId("archived-preps")).toBeNull();
  });
});
