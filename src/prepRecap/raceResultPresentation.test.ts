import type { PlanSession } from "../marathonPrediction";
import {
  finishTimeSourceNote,
  formatRaceDateDe,
  formatRacePace,
  goalReachedLine,
  isGoalReached,
  resolveRaceDistanceKm,
} from "./raceResultPresentation";

const raceSession: PlanSession = {
  id: "r",
  day: "So",
  date: "27. Sep",
  dateIso: "2026-09-27",
  type: "race",
  title: "Marathon",
  km: 42.2,
};

describe("raceResultPresentation", () => {
  it("formatiert das Renndatum deutsch", () => {
    expect(formatRaceDateDe("2026-09-27")).toBe("27. September 2026");
    expect(formatRaceDateDe("kaputt")).toBeNull();
  });

  it("rechnet 42,2 Plan-km als offizielle Marathondistanz", () => {
    expect(resolveRaceDistanceKm(raceSession)).toBe(42.195);
    expect(resolveRaceDistanceKm(raceSession, 21.0975)).toBe(21.0975);
    expect(resolveRaceDistanceKm(null)).toBeNull();
  });

  it("berechnet die Pace aus Zeit und Renndistanz", () => {
    expect(formatRacePace(11637, 42.195)).toBe("4:36/km");
    expect(formatRacePace(11637, null)).toBeNull();
  });

  it("kennzeichnet unbestätigte Zeiten", () => {
    expect(finishTimeSourceNote({ seconds: 11637, confirmed: false })).toBe("laut Apple Health");
    expect(finishTimeSourceNote({ seconds: 11637, confirmed: true })).toBeNull();
  });

  it("zeigt den Abstand nur bei erreichtem Ziel", () => {
    expect(isGoalReached(10000, 10190)).toBe(true);
    expect(goalReachedLine(10000, 10190)).toBe("3:10 unter deinem Ziel");
    expect(goalReachedLine(10190, 10190)).toBe("Punktlandung auf dein Ziel");
  });

  it("formuliert ein verpasstes Ziel nie als Rückstand", () => {
    expect(isGoalReached(11637, 10190)).toBe(false);
    expect(goalReachedLine(11637, 10190)).toBeNull();
    expect(goalReachedLine(11637, null)).toBeNull();
  });
});
