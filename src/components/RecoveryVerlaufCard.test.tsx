import { render, screen } from "@testing-library/react";
import RecoveryVerlaufCard from "./RecoveryVerlaufCard";
import type { RecoveryVerlaufCardPresentation } from "../recovery/recoveryPresentation";

const base: RecoveryVerlaufCardPresentation = {
  header: { score: 58, statusLabel: "Belastet", statusColor: "", deltaLine: "±0 zu gestern" },
  factors: [
    { id: "sleep", label: "Schlaf", trend: "↑", context: "78/100 (7d)", available: true, trendColor: "" },
    { id: "hrv", label: "HRV", trend: "→", context: "63/100 (7d)", available: true, trendColor: "" },
    { id: "load", label: "Belastung", trend: "↑", context: "niedrig", available: true, trendColor: "" },
    { id: "trend", label: "Verlauf", trend: "↓", context: "fallend (7d)", available: true, trendColor: "" },
  ],
  trendValues: [60, 58],
  trendDates: ["2026-10-14", "2026-10-15"],
  insightText: null,
  insightShowWarning: false,
  fallback7d: null,
};

describe("RecoveryVerlaufCard", () => {
  test("deutsch, Zahl mit Chip, drei Kacheln und 7-Tage-Balken mit Tagesbuchstaben", () => {
    const { container } = render(<RecoveryVerlaufCard presentation={base} tone="fair" toneLabel="Mittel" />);
    expect(screen.getByText("Erholung heute")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Recovery|[↑↓→]/);
    expect(screen.getByText("58")).toBeInTheDocument();
    expect(screen.getByText("Mittel")).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText("63")).toBeInTheDocument();
    expect(screen.getByText("Niedrig")).toBeInTheDocument();
    expect(screen.getByText("±0 zu gestern · 7 Tage fallend")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Erholung der letzten 7 Tage, fallend" })).toHaveTextContent("MD");
  });

  test("ohne Daten: Strich statt erfundener Zahl, Zustand als Chip", () => {
    render(
      <RecoveryVerlaufCard
        presentation={{
          ...base,
          header: { score: null, statusLabel: "Zu wenig Daten", statusColor: "", deltaLine: null },
          factors: base.factors.map((f) => ({ ...f, available: false })),
          trendValues: [],
          trendDates: [],
        }}
      />,
    );
    expect(screen.getByText("Zu wenig Daten")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
