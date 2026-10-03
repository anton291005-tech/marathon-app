import type { PlanWeek } from "../../marathonPrediction";
import { getPrepCompletionState } from "../../prepRecap/prepCompletionState";
import { buildCoachPrepStatus } from "./coachPrepStatus";
import { toRemoteCoachPayload } from "./getAiContext";

const plan = [
  {
    wn: 1,
    s: [{ id: "w1-di", type: "easy", title: "Lockerer Lauf", km: 8, date: "7. Jul", dateIso: "2026-07-07" }],
  },
  {
    wn: 12,
    s: [{ id: "w12-so", type: "race", title: "WARSCHAU MARATHON", km: 42.2, date: "27. Sep", dateIso: "2026-09-27" }],
  },
] as unknown as PlanWeek[];

const preferences = { raceName: "Warschau Marathon", raceDate: "27.09.2026", raceGoal: "time", targetTime: "2:50:00" } as any;

function statusOn(todayYmd: string, finish: { seconds: number; confirmed: boolean } | null = { seconds: 11475, confirmed: true }) {
  return buildCoachPrepStatus({
    completion: getPrepCompletionState({ plan, logs: {}, todayYmd, preferences }),
    finish,
    goalSeconds: 10200,
    raceDistanceKm: 42.195,
    todayYmd,
  });
}

describe("buildCoachPrepStatus", () => {
  it("laufender Plan: kein Abschluss-Kontext", () => {
    expect(statusOn("2026-09-20")).toBeNull();
    expect(statusOn("2026-09-27")).toBeNull();
  });

  it("abgeschlossen: Rennergebnis aus Zeit, Bestätigung, Ziel und Pace", () => {
    const status = statusOn("2026-09-28");
    expect(status).toMatchObject({
      status: "completed",
      completedBy: "date_passed",
      raceYmd: "2026-09-27",
      raceName: "Warschau Marathon",
      focus: "recovery",
    });
    expect(status?.result).toMatchObject({
      finishTime: "3:11:15",
      finishTimeSeconds: 11475,
      finishTimeConfirmed: true,
      goal: "Ziel: Sub 2:50",
      goalSeconds: 10200,
      distanceKm: 42.195,
    });
    expect(status?.result.pacePerKm).toEqual(expect.stringContaining("4:32"));
  });

  it("Renntag nur vorbei (keine Zeit, nicht abgehakt): nicht gelaufen, kein Erholungsfokus, keine erfundene Zeit", () => {
    const status = statusOn("2026-09-28", null);
    expect(status).toMatchObject({ completedBy: "date_passed", raceRun: false, focus: "plan_over" });
    expect(status?.result).toMatchObject({ finishTime: null, finishTimeSeconds: null, finishTimeConfirmed: false, pacePerKm: null });
  });

  it("Rennen abgehakt ohne Zeit: gelaufen, Erholungsfokus", () => {
    const completion = getPrepCompletionState({ plan, logs: { "w12-so": { done: true } } as any, todayYmd: "2026-09-28", preferences });
    const status = buildCoachPrepStatus({ completion, finish: null, goalSeconds: null, raceDistanceKm: 42.195, todayYmd: "2026-09-28" });
    expect(status).toMatchObject({ completedBy: "race_done", raceRun: true, focus: "recovery" });
  });

  it("Plan ohne Rennen (plan_ended): nie gelaufen, auch nicht mit Zeit", () => {
    const noRace = [plan[0]] as PlanWeek[];
    const completion = getPrepCompletionState({ plan: noRace, logs: {}, todayYmd: "2026-07-10", preferences: {} as any });
    const status = buildCoachPrepStatus({ completion, finish: { seconds: 3000, confirmed: false }, goalSeconds: null, raceDistanceKm: null, todayYmd: "2026-07-10" });
    expect(status).toMatchObject({ completedBy: "plan_ended", raceRun: false, focus: "plan_over" });
  });

  it("Erholungsfokus bis Tag 14 nach dem Rennen, ab Tag 15 neutral", () => {
    expect(statusOn("2026-10-11")?.focus).toBe("recovery");
    expect(statusOn("2026-10-12")?.focus).toBe("ready_for_new_prep");
  });

  it("derselbe Tag liefert denselben Kontext", () => {
    expect(JSON.stringify(statusOn("2026-10-03"))).toBe(JSON.stringify(statusOn("2026-10-03")));
  });

  it("toRemoteCoachPayload reicht den Abschluss-Zustand durch, sonst null", () => {
    const base = { todayIso: "2026-10-03T08:00:00.000Z", raceDateIso: null, goals: {}, plan: [], logs: {}, next14Days: [], availableScreens: [] };
    expect(toRemoteCoachPayload(base as any).prepStatus).toBeNull();
    const prepStatus = statusOn("2026-10-03");
    expect(toRemoteCoachPayload({ ...base, prepStatus } as any).prepStatus).toEqual(prepStatus);
  });
});
