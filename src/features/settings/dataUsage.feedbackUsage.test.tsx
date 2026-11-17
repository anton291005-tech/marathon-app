import { render, screen } from "@testing-library/react";
import { SettingsDataUsagePage } from "./SettingsDataUsagePage";
import { FEEDBACK_DATA_ITEMS, USAGE_DATA_ITEMS } from "./dataUsage";

describe("Datennutzung: Feedback und Nutzungsdaten", () => {
  test("beide Abschnitte mit allen Einträgen und dem Hinweis auf den Schalter", () => {
    render(<SettingsDataUsagePage />);
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    expect(screen.getByText("Nutzungsdaten")).toBeInTheDocument();
    for (const item of [...FEEDBACK_DATA_ITEMS, ...USAGE_DATA_ITEMS]) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByText(/Ausschalten kannst du das unter Datenschutz & Daten mit „Nutzung zählen“/)).toBeInTheDocument();
    expect(screen.getAllByText(/an keinen KI-Anbieter/)).toHaveLength(2);
  });
});
