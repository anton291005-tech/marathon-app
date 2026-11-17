import { render, screen } from "@testing-library/react";
import MarathonPredictionCard, { visibleMarathonMarks } from "./MarathonPredictionCard";

const ready = {
  ready: true,
  predictedTime: "3:58:00",
  predictedSeconds: 14280,
  consistencyScore: 72,
  sub3ProbabilityPercent: 0,
  sub250ProbabilityPercent: 0,
  rangeLabel: "3:50–4:06",
} as any;

describe("MarathonPredictionCard — Marken nur passend zur Zielzeit", () => {
  test("Ziel 4:00: keine „Unter 3:00“/„Unter 2:50“-Spalten", () => {
    render(<MarathonPredictionCard variant="full" prediction={ready} targetTimeLabel="4:00:00" targetSeconds={4 * 3600} />);
    expect(screen.queryByText("Unter 3:00")).toBeNull();
    expect(screen.queryByText("Unter 2:50")).toBeNull();
    expect(screen.getByText("Konstanz")).toBeInTheDocument();
  });

  test("Ziel 2:50 (Antons Fall): beide Marken wie bisher", () => {
    render(<MarathonPredictionCard variant="full" prediction={ready} targetSeconds={2 * 3600 + 50 * 60} />);
    expect(screen.getByText("Unter 3:00")).toBeInTheDocument();
    expect(screen.getByText("Unter 2:50")).toBeInTheDocument();
  });

  test("Regel", () => {
    expect(visibleMarathonMarks(undefined)).toEqual({ sub3: true, sub250: true });
    expect(visibleMarathonMarks(null)).toEqual({ sub3: false, sub250: false });
    expect(visibleMarathonMarks(3 * 3600 + 10 * 60)).toEqual({ sub3: true, sub250: false });
    expect(visibleMarathonMarks(3 * 3600 + 30 * 60)).toEqual({ sub3: false, sub250: false });
  });
});
