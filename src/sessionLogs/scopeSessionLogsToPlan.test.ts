import type { SessionLog } from "../marathonPrediction";
import type { TrainingPlanV2 } from "../planV2/types";
import {
  isSessionLogBeforePlanStart,
  logsNotBeforeForSuccessorPlan,
  mergeWithLogsOutsidePlanScope,
  planStartYmd,
  scopeSessionLogsToPlan,
  sessionLogLatestYmd,
} from "./scopeSessionLogsToPlan";

function plan(dates: string[]): TrainingPlanV2 {
  return {
    version: 2,
    workouts: dates.map((dateIso, i) => ({ id: `w${i}`, dateIso, sport: "run", sessionType: "easy", title: "Easy", km: 5 })),
    weeks: [],
  } as TrainingPlanV2;
}

const run = (startDate: string): SessionLog["assignedRun"] => ({ runId: "r1", startDate, duration: 1800, distanceKm: 6 });

describe("planStartYmd", () => {
  it("nimmt das früheste Workout, unabhängig von der Reihenfolge", () => {
    expect(planStartYmd(plan(["2026-10-10T10:00:00.000Z", "2026-10-02T10:00:00.000Z", "2026-10-04"]))).toBe("2026-10-02");
  });

  it("ist null ohne datierte Workouts", () => {
    expect(planStartYmd(plan([]))).toBeNull();
    expect(planStartYmd(null)).toBeNull();
  });
});

describe("sessionLogLatestYmd / isSessionLogBeforePlanStart", () => {
  it("nimmt die späteste Angabe aus at und assignedRun.startDate", () => {
    expect(sessionLogLatestYmd({ at: "2026-09-01T09:00:00.000Z", assignedRun: run("2026-09-03T07:00:00.000Z") })).toBe("2026-09-03");
  });

  it("verwirft nur Logs mit Zeitangabe vor dem Planstart", () => {
    expect(isSessionLogBeforePlanStart({ done: true, at: "2026-09-30T09:00:00.000Z" }, "2026-10-02")).toBe(true);
    expect(isSessionLogBeforePlanStart({ done: true, at: "2026-10-02T06:00:00.000Z" }, "2026-10-02")).toBe(false);
    expect(isSessionLogBeforePlanStart({ done: true }, "2026-10-02")).toBe(false);
  });
});

describe("scopeSessionLogsToPlan", () => {
  const p = plan(["2026-10-02T10:00:00.000Z", "2026-10-05T10:00:00.000Z"]);

  it("entfernt Logs von vor dem Planstart und behält eigene sowie undatierte", () => {
    const logs: Record<string, SessionLog> = {
      old: { done: true, at: "2026-08-30T09:00:00.000Z" },
      oldRun: { assignedRun: run("2026-09-20T07:00:00.000Z") },
      mine: { done: true, at: "2026-10-02T18:00:00.000Z" },
      legacy: { done: true },
    };
    expect(Object.keys(scopeSessionLogsToPlan(logs, p)).sort()).toEqual(["legacy", "mine"]);
  });

  it("verwirft mit notBefore auch Logs vom Starttag, die davor entstanden", () => {
    const logs: Record<string, SessionLog> = {
      before: { done: true, at: "2026-10-02T08:00:00.000Z" },
      after: { done: true, at: "2026-10-02T19:00:00.000Z" },
    };
    expect(Object.keys(scopeSessionLogsToPlan(logs, p, "2026-10-02T12:00:00.000Z"))).toEqual(["after"]);
  });

  it("liefert dieselbe Referenz, wenn nichts herausfällt", () => {
    const logs: Record<string, SessionLog> = { mine: { done: true, at: "2026-10-03T09:00:00.000Z" } };
    expect(scopeSessionLogsToPlan(logs, p)).toBe(logs);
  });
});

describe("logsNotBeforeForSuccessorPlan", () => {
  const archived = (archived_at: string | null) => ({ archived_at });

  it("liefert die Archivierung des Vorgängers für den direkt danach angelegten Plan", () => {
    expect(
      logsNotBeforeForSuccessorPlan("2026-10-02T18:00:05.000Z", [
        archived("2026-10-02T18:00:01.000Z"),
        archived("2025-11-01T10:00:00.000Z"),
      ]),
    ).toBe("2026-10-02T18:00:01.000Z");
  });

  it("toleriert eine Client-Uhr, die der Server-Uhr einige Minuten vorausläuft", () => {
    expect(logsNotBeforeForSuccessorPlan("2026-10-02T18:00:00.000Z", [archived("2026-10-02T18:03:00.000Z")])).toBe(
      "2026-10-02T18:03:00.000Z",
    );
  });

  it("ist null ohne Archiv (z. B. registrierter Gast) und für einen älteren Parallelplan", () => {
    expect(logsNotBeforeForSuccessorPlan("2026-10-02T20:00:00.000Z", [])).toBeNull();
    expect(logsNotBeforeForSuccessorPlan("2026-08-01T10:00:00.000Z", [archived("2026-10-02T18:00:00.000Z")])).toBeNull();
    expect(logsNotBeforeForSuccessorPlan(null, [archived("2026-10-02T18:00:00.000Z")])).toBeNull();
  });
});

describe("mergeWithLogsOutsidePlanScope", () => {
  it("erhält ausgeblendete Logs beim Speichern, außer dieselbe ID wird neu belegt", () => {
    const stored: Record<string, SessionLog> = {
      "w5-mi": { done: true, at: "2026-07-08T09:00:00.000Z" },
      "w25-so": { done: true, at: "2026-09-27T09:00:00.000Z" },
      "w1-fr": { done: false, at: "2026-10-02T09:00:00.000Z" },
    };
    const scoped = { "w1-fr": stored["w1-fr"] };
    const next = { "w1-fr": { done: true, at: "2026-10-02T10:00:00.000Z" }, "w5-mi": { done: true, at: "2026-10-28T10:00:00.000Z" } };
    expect(mergeWithLogsOutsidePlanScope(stored, scoped, next)).toEqual({
      "w25-so": stored["w25-so"],
      "w1-fr": next["w1-fr"],
      "w5-mi": next["w5-mi"],
    });
  });

  it("ist ein No-op, wenn die Plan-Sicht nichts ausblendet", () => {
    const stored: Record<string, SessionLog> = { a: { done: true } };
    const next = { b: { done: true } };
    expect(mergeWithLogsOutsidePlanScope(stored, stored, next)).toBe(next);
  });
});
