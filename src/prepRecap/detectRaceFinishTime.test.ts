import type { StoredHealthRun } from "../healthRuns";
import type { PlanSession } from "../marathonPrediction";
import { detectRaceFinishTime, minFinishDistanceKm } from "./detectRaceFinishTime";

const raceSession: PlanSession = {
  id: "w25-so",
  day: "So",
  date: "27. Sep",
  dateIso: "2026-09-27",
  type: "race",
  title: "WARSCHAU MARATHON",
  km: 42.2,
};

function run(partial: Partial<StoredHealthRun>): StoredHealthRun {
  return {
    runId: partial.runId ?? "hk_x",
    // Lokale Mittagszeit — unabhängig von der Zeitzone der Testumgebung am 27.09.
    startDate: partial.startDate ?? new Date(2026, 8, 27, 9, 0, 19).toISOString(),
    duration: partial.duration ?? 11637,
    distanceMeters: partial.distanceMeters === undefined ? 42629 : partial.distanceMeters,
    distanceUnknown: partial.distanceUnknown ?? false,
    workoutType: partial.workoutType ?? "running",
    ...partial,
  } as StoredHealthRun;
}

describe("minFinishDistanceKm", () => {
  it("verlangt beim Marathon 40 km", () => {
    expect(minFinishDistanceKm(42.195)).toBe(40);
    expect(minFinishDistanceKm(null)).toBe(40);
  });

  it("skaliert für kürzere Renndistanzen", () => {
    expect(minFinishDistanceKm(21.1)).toBeCloseTo(20.045, 3);
  });
});

describe("detectRaceFinishTime", () => {
  it("nimmt den an der Race-Session zugeordneten Health-Lauf", () => {
    const result = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: {
        done: true,
        assignedRun: { runId: "hk_1", startDate: "2026-09-27T07:00:19Z", duration: 11637, distanceKm: 42.63 },
      },
      healthRuns: [],
    });
    expect(result).toEqual({ seconds: 11637, distanceKm: 42.63, source: "health" });
  });

  it("findet ohne Zuordnung den Lauf am lokalen Renntag", () => {
    const result = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: { done: true },
      healthRuns: [run({ runId: "easy", distanceMeters: 8000, duration: 2700 }), run({ runId: "race" })],
    });
    expect(result).toEqual({ seconds: 11637, distanceKm: 42.629, source: "health" });
  });

  it("ignoriert Läufe unter 40 km, an anderen Tagen und Radfahrten", () => {
    const result = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: undefined,
      healthRuns: [
        run({ runId: "short", distanceMeters: 39000 }),
        run({ runId: "other-day", startDate: new Date(2026, 8, 26, 9, 0, 0).toISOString() }),
        run({ runId: "bike", workoutType: "cycling", distanceMeters: 80000 }),
        run({ runId: "unknown", distanceMeters: null, distanceUnknown: true }),
      ],
    });
    expect(result).toBeNull();
  });

  it("verwirft eine zugeordnete Aktivität, die zu kurz ist, und sucht weiter", () => {
    const result = detectRaceFinishTime({
      raceSession,
      raceYmd: "2026-09-27",
      raceLog: { assignedRun: { runId: "hk_short", startDate: "2026-09-27T07:00:00Z", duration: 900, distanceKm: 3 } },
      healthRuns: [run({ runId: "race" })],
    });
    expect(result?.seconds).toBe(11637);
  });

  it("liefert null ohne Race-Session und ohne Daten", () => {
    expect(detectRaceFinishTime({ raceSession: null, raceYmd: "2026-09-27", raceLog: undefined, healthRuns: [run({})] })).toBeNull();
    expect(detectRaceFinishTime({ raceSession, raceYmd: "2026-09-27", raceLog: undefined, healthRuns: [] })).toBeNull();
  });
});
