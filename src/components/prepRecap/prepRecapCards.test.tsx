import { render, screen } from "@testing-library/react";
import PrepCompleteHeroCard from "./PrepCompleteHeroCard";
import RaceResultCard from "./RaceResultCard";

const base = {
  raceName: "Warschau Marathon",
  raceYmd: "2026-09-27",
  goalSeconds: 10190,
  raceDistanceKm: 42.195,
};

describe("PrepCompleteHeroCard", () => {
  it("zeigt Rennen, Datum, Zielvorgabe und die unbestätigte Health-Zeit", () => {
    render(<PrepCompleteHeroCard {...base} finish={{ seconds: 11637, confirmed: false }} />);
    expect(screen.getByText(/Vorbereitung abgeschlossen/)).toBeInTheDocument();
    expect(screen.getByText("Warschau Marathon")).toBeInTheDocument();
    expect(screen.getByText("27. September 2026 · Ziel: Sub 2:50")).toBeInTheDocument();
    expect(screen.getByTestId("prep-complete-hero-time")).toHaveTextContent("3:13:57");
    expect(screen.getByText("4:36/km · laut Apple Health")).toBeInTheDocument();
    expect(screen.queryByText(/unter deinem Ziel/)).toBeNull();
  });

  it("hat in diesem Schritt keine Buttons", () => {
    render(<PrepCompleteHeroCard {...base} finish={{ seconds: 11637, confirmed: false }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lässt ohne Zeit die Zeitzeile weg und zeigt nie 0 oder N/A", () => {
    const { container } = render(<PrepCompleteHeroCard {...base} goalSeconds={null} finish={null} />);
    expect(screen.queryByTestId("prep-complete-hero-time")).toBeNull();
    expect(container.textContent).not.toMatch(/N\/A|0:00:00|\b0 km/);
    expect(screen.getByText("27. September 2026")).toBeInTheDocument();
  });

  it("feiert ein erreichtes Ziel", () => {
    render(<PrepCompleteHeroCard {...base} finish={{ seconds: 10000, confirmed: true }} />);
    expect(screen.getByText("3:10 unter deinem Ziel")).toBeInTheDocument();
    expect(screen.getByText("3:57/km")).toBeInTheDocument();
  });
});

describe("RaceResultCard", () => {
  const done = { ...base, completedBy: "race_done" as const };

  it("zeigt Ergebnis statt Prognose, Sub-3 oder Confidence", () => {
    const { container } = render(<RaceResultCard {...done} finish={{ seconds: 11637, confirmed: false }} />);
    expect(screen.getByText("Rennergebnis")).toBeInTheDocument();
    expect(screen.getByTestId("race-result-time")).toHaveTextContent("3:13:57");
    expect(screen.getByText("laut Apple Health")).toBeInTheDocument();
    expect(screen.getByText("Sub 2:50")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Prognose|Sub-3|Confidence|Wahrscheinlichkeit/);
  });

  it("zeigt bei verpasstem Ziel keinen Rückstand", () => {
    const { container } = render(<RaceResultCard {...done} finish={{ seconds: 11637, confirmed: true }} />);
    expect(container.textContent).not.toMatch(/verfehlt|\+\d|über deinem Ziel/);
    expect(screen.queryByText("laut Apple Health")).toBeNull();
  });

  it("feiert ein erledigtes Rennen auch ohne erkannte Zeit", () => {
    render(<RaceResultCard {...done} finish={null} />);
    expect(screen.getByText("Rennen gelaufen 🎉")).toBeInTheDocument();
    expect(screen.getByText("Ziel: Sub 2:50")).toBeInTheDocument();
    expect(screen.queryByTestId("race-result-time")).toBeNull();
  });

  it("behauptet keinen Lauf, wenn nur das Renndatum vorbei ist", () => {
    render(<RaceResultCard {...base} completedBy="date_passed" finish={null} />);
    expect(screen.getByText("Renntag vorbei")).toBeInTheDocument();
    expect(screen.queryByText(/gelaufen/)).toBeNull();
  });

  it("benennt einen Plan ohne Race-Session passend", () => {
    render(<RaceResultCard {...base} raceName={null} goalSeconds={null} finish={null} completedBy="plan_ended" />);
    expect(screen.getByText("Vorbereitung abgeschlossen")).toBeInTheDocument();
    expect(screen.getByText("Plan durchgezogen 🎉")).toBeInTheDocument();
  });
});
