import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import {
  cleanRaceTitle,
  findGoalRaceSession,
  formatGoalLabel,
  getPrepCompletionState,
  raceNameFromPlanName,
  resolveRaceName,
} from "./prepCompletionState";

function session(id: string, dateIso: string | undefined, type: string, extra: Partial<PlanSession> = {}): PlanSession {
  const [, m, d] = (dateIso ?? "2026-09-27").split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return {
    id,
    day: "So",
    date: `${d}. ${months[m - 1]}`,
    ...(dateIso ? { dateIso } : {}),
    type,
    title: extra.title ?? type,
    km: extra.km ?? 10,
    ...extra,
  };
}

function plan(sessions: PlanSession[]): PlanWeek[] {
  return [{ wn: 1, phase: "taper", km: 60, s: sessions }];
}

const warsawPlan = plan([
  session("w21-so", "2026-08-30", "race", { title: "🏁 KÖLN HALBMARATHON", km: 21.1 }),
  session("w25-sa", "2026-09-26", "easy", { km: 5 }),
  session("w25-so", "2026-09-27", "race", { title: "🏆 WARSCHAU MARATHON – SUB 2:50!", km: 42.2 }),
]);

const prefs = { raceName: "Warschau Marathon", raceGoal: "time" as const, targetTime: "2:49:50" };

describe("findGoalRaceSession", () => {
  it("nimmt die zeitlich letzte Race-Session, nicht das Vorbereitungsrennen", () => {
    expect(findGoalRaceSession(warsawPlan)?.session.id).toBe("w25-so");
    expect(findGoalRaceSession(warsawPlan)?.ymd).toBe("2026-09-27");
  });

  it("liefert null ohne Race-Session", () => {
    expect(findGoalRaceSession(plan([session("a", "2026-09-01", "easy")]))).toBeNull();
  });

  it("fällt ohne dateIso auf das Datumslabel zurück", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const legacy = plan([session("legacy-race", undefined, "race")]);
    expect(findGoalRaceSession(legacy)?.ymd).toBe("2026-09-27");
    warn.mockRestore();
  });
});

describe("getPrepCompletionState", () => {
  const noLogs: Record<string, SessionLog> = {};

  it("ist active vor dem Rennen und am offenen Renntag", () => {
    expect(getPrepCompletionState({ plan: warsawPlan, logs: noLogs, todayYmd: "2026-09-20", preferences: prefs }).status).toBe("active");
    expect(getPrepCompletionState({ plan: warsawPlan, logs: noLogs, todayYmd: "2026-09-27", preferences: prefs }).status).toBe("active");
  });

  it("ist completed am Renntag, sobald die Race-Session erledigt ist", () => {
    const state = getPrepCompletionState({
      plan: warsawPlan,
      logs: { "w25-so": { done: true } },
      todayYmd: "2026-09-27",
      preferences: prefs,
    });
    expect(state).toMatchObject({ status: "completed", completedBy: "race_done", raceYmd: "2026-09-27" });
  });

  it("zählt einen zugeordneten Health-Lauf als erledigt", () => {
    const state = getPrepCompletionState({
      plan: warsawPlan,
      logs: { "w25-so": { assignedRun: { runId: "hk_1", startDate: "2026-09-27T07:00:19Z", duration: 11637, distanceKm: 42.63 } } },
      todayYmd: "2026-09-27",
      preferences: prefs,
    });
    expect(state.status === "completed" && state.completedBy).toBe("race_done");
  });

  it("ist completed nach dem Renndatum, auch ohne Haken", () => {
    const state = getPrepCompletionState({ plan: warsawPlan, logs: noLogs, todayYmd: "2026-09-28", preferences: prefs });
    expect(state).toMatchObject({ status: "completed", completedBy: "date_passed" });
  });

  it("wird durch das erledigte Vorbereitungsrennen nicht ausgelöst", () => {
    const state = getPrepCompletionState({
      plan: warsawPlan,
      logs: { "w21-so": { done: true } },
      todayYmd: "2026-09-01",
      preferences: prefs,
    });
    expect(state.status).toBe("active");
  });

  it("liefert Rennname und exakte Zielsekunden", () => {
    const state = getPrepCompletionState({ plan: warsawPlan, logs: noLogs, todayYmd: "2026-09-30", preferences: prefs });
    expect(state).toMatchObject({ raceName: "Warschau Marathon", goalSeconds: 10190 });
  });

  it("hat keine Zielvorgabe bei Ziel „Finishen\" oder ohne Zielzeit", () => {
    const finish = getPrepCompletionState({
      plan: warsawPlan,
      logs: noLogs,
      todayYmd: "2026-09-30",
      preferences: { ...prefs, raceGoal: "finish" },
    });
    const missing = getPrepCompletionState({
      plan: warsawPlan,
      logs: noLogs,
      todayYmd: "2026-09-30",
      preferences: { raceName: null, targetTime: null },
    });
    expect(finish.status === "completed" && finish.goalSeconds).toBeNull();
    expect(missing.status === "completed" && missing.goalSeconds).toBeNull();
  });

  it("endet ohne Race-Session am Tag nach dem letzten Workout (plan_ended)", () => {
    const noRace = plan([
      session("a", "2026-09-20", "easy"),
      session("b", "2026-09-21", "long"),
      session("c", "2026-09-22", "rest"),
    ]);
    expect(getPrepCompletionState({ plan: noRace, logs: noLogs, todayYmd: "2026-09-21", preferences: prefs }).status).toBe("active");
    expect(getPrepCompletionState({ plan: noRace, logs: noLogs, todayYmd: "2026-09-22", preferences: prefs })).toMatchObject({
      status: "completed",
      completedBy: "plan_ended",
      raceSession: null,
      raceYmd: "2026-09-21",
    });
  });

  it("bleibt active für einen leeren Plan", () => {
    expect(getPrepCompletionState({ plan: [], logs: noLogs, todayYmd: "2026-09-30", preferences: prefs }).status).toBe("active");
  });
});

describe("Rennname-Kaskade", () => {
  const raceSession = warsawPlan[0].s[2];

  it("bevorzugt preferences.raceName", () => {
    expect(resolveRaceName({ preferences: prefs, raceSession, planName: "Marathon – Anders – 2026-09-27" })).toBe(
      "Warschau Marathon",
    );
  });

  it("nimmt sonst den bereinigten Race-Titel", () => {
    expect(resolveRaceName({ preferences: { raceName: "  " }, raceSession })).toBe("Warschau Marathon");
  });

  it("nimmt zuletzt den Plan-Namen ohne Datum", () => {
    expect(resolveRaceName({ preferences: {}, raceSession: null, planName: "Marathon – Berlin Marathon – 2027-09-26" })).toBe(
      "Berlin Marathon",
    );
  });

  it("liefert null, wenn nichts Verwertbares da ist", () => {
    expect(resolveRaceName({ preferences: {}, raceSession: null, planName: "Marathon – 2027-09-26" })).toBeNull();
    expect(resolveRaceName({ preferences: {}, raceSession: null, planName: null })).toBeNull();
  });

  it("bereinigt Titel mit Emoji und Zielzusatz", () => {
    expect(cleanRaceTitle("🏆 WARSCHAU MARATHON – SUB 2:50!")).toBe("Warschau Marathon");
    expect(cleanRaceTitle("Berlin Marathon")).toBe("Berlin Marathon");
    expect(cleanRaceTitle("🏆")).toBeNull();
  });

  it("zerlegt plan_name auch mit deutschem Datum", () => {
    expect(raceNameFromPlanName("Marathon – Warschau Marathon – 27.09.2026")).toBe("Warschau Marathon");
    expect(raceNameFromPlanName("Nur ein Name")).toBeNull();
  });
});

describe("formatGoalLabel", () => {
  it("rundet auf die volle Minute auf", () => {
    expect(formatGoalLabel(10190)).toBe("Ziel: Sub 2:50");
    expect(formatGoalLabel(10800)).toBe("Ziel: Sub 3:00");
    expect(formatGoalLabel(10741)).toBe("Ziel: Sub 3:00");
    expect(formatGoalLabel(3 * 3600 + 29 * 60 + 1)).toBe("Ziel: Sub 3:30");
  });
});
