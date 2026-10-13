import { fireEvent, render, screen } from "@testing-library/react";
import { TodayHero } from "./TodayCards";

const handlers = () => ({ onToggleDone: jest.fn(), onToggleSkip: jest.fn(), onOpenDetails: jest.fn() });
const session = { title: "Mittellanger Dauerlauf", distanceKm: 15.9, hrFact: "Zone 2 · 120–150 bpm", hint: "Locker bleiben." };

describe("TodayHero", () => {
  test("Ruhetag: deutsch, mit Begründung, ohne Erledigt/Auslassen", () => {
    render(<TodayHero label="Woche 1 von 8" session={null} restReason="Vollständige Erholung." status="open" {...handlers()} />);
    expect(screen.getByText("Ruhetag")).toBeInTheDocument();
    expect(screen.getByText("Vollständige Erholung.")).toBeInTheDocument();
    expect(screen.queryByText("Rest Day")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("offene Einheit: km als Hauptzahl mit Dezimalkomma, Erledigt und Auslassen lösen aus", () => {
    const h = handlers();
    render(<TodayHero label="Lauf · Woche 1 von 8" session={session} restReason="" status="open" {...h} />);
    expect(screen.getByText("15,9")).toBeInTheDocument();
    expect(screen.getByText("Zone 2 · 120–150 bpm")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erledigt" }));
    fireEvent.click(screen.getByRole("button", { name: "Auslassen" }));
    fireEvent.click(screen.getByRole("button", { name: /Details zu Mittellanger Dauerlauf/ }));
    expect(h.onToggleDone).toHaveBeenCalledTimes(1);
    expect(h.onToggleSkip).toHaveBeenCalledTimes(1);
    expect(h.onOpenDetails).toHaveBeenCalledTimes(1);
  });

  test("erledigt: nur Rückgängig; über Health erledigt: keine Aktion", () => {
    const { rerender } = render(<TodayHero label="Lauf" session={session} restReason="" status="done" {...handlers()} />);
    expect(screen.getByRole("button", { name: "Erledigt-Markierung rückgängig machen" })).toBeInTheDocument();
    expect(screen.queryByText("Auslassen")).not.toBeInTheDocument();
    rerender(<TodayHero label="Lauf" session={session} restReason="" status="done" canToggleDone={false} {...handlers()} />);
    expect(screen.queryByText("Rückgängig")).not.toBeInTheDocument();
  });
});
