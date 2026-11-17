import { render, screen } from "@testing-library/react";
import { SessionDetailSheet, type SessionDetailResult } from "./SessionDetailSheet";

const noop = () => {};

const RESULT: SessionDetailResult = {
  actualKm: 10.12,
  plannedKm: 10,
  durationSec: 3300,
  paceSecPerKm: 326,
  hrBpm: 146,
  verdict: "Im Zielkorridor",
  verdictGood: true,
  source: "Strava",
  feeling: null,
  notes: null,
};

function sheet(result: SessionDetailResult) {
  return (
    <SessionDetailSheet
      meta="Mo, 16. Nov · Woche 3 · Grundlage"
      title="Lockerer Dauerlauf"
      status="done"
      plan={null}
      purpose={null}
      flow={null}
      fuelingHints={[]}
      result={result}
      onClose={noop}
      onDiscussWithCoach={noop}
      onEnter={noop}
      onToggleSkip={noop}
    />
  );
}

describe("SessionDetailSheet — Lauf aus Strava", () => {
  test("Ist-Werte mit „Powered by Strava“ statt Quelltext", () => {
    render(sheet(RESULT));
    expect(screen.getByTestId("session-result")).toBeInTheDocument();
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
    expect(screen.queryByText("Apple Health")).toBeNull();
  });

  test("Apple Health bleibt Text", () => {
    render(sheet({ ...RESULT, source: "Apple Health" }));
    expect(screen.getByText("Apple Health")).toBeInTheDocument();
    expect(screen.queryByAltText("Powered by Strava")).toBeNull();
  });
});
