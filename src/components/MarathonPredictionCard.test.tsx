import { render, screen } from "@testing-library/react";
import MarathonPredictionCard from "./MarathonPredictionCard";

const prediction = { ready: false } as any;

describe("MarathonPredictionCard — Ziel-Zeile", () => {
  test("Zielzeit bekommt das Wort Ziel davor", () => {
    render(<MarathonPredictionCard variant="full" prediction={prediction} targetTimeLabel="3:15:00" />);
    expect(screen.getByText("Ziel 3:15:00")).toBeInTheDocument();
  });

  test("Ziel: Finishen wird nicht zu Ziel Ziel: Finishen", () => {
    render(<MarathonPredictionCard variant="full" prediction={prediction} targetTimeLabel="Ziel: Finishen" />);
    expect(screen.getByText("Ziel: Finishen")).toBeInTheDocument();
    expect(screen.queryByText(/Ziel Ziel/)).toBeNull();
  });
});
