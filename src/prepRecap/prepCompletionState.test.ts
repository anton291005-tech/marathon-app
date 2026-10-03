import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { buildOnboardingPreferencesPatch } from "../onboarding/marathonPreferencesOnboarding";
import { buildIsolatedOnboardingPreferences } from "../onboarding/onboardingPlanIsolation";
import { resolveCompletedPrepGoal, type PrepRecapRecord } from "./prepRecapRecord";
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

  it("ignoriert preferences.raceName eines anderen Plans (Renndatum passt nicht zum Renntag)", () => {
    const other = { raceName: "Testplan Archiv-Flow", raceDate: "18.04.2027" };
    expect(resolveRaceName({ preferences: other, raceSession, raceYmd: "2026-09-27" })).toBe("Warschau Marathon");
    expect(resolveRaceName({ preferences: other, raceSession: null, planName: "Marathon – Berlin Marathon – 2026-09-27", raceYmd: "2026-09-27" })).toBe(
      "Berlin Marathon",
    );
  });

  it("nimmt preferences.raceName, wenn das Renndatum zum Plan passt oder fehlt (Alt-Bestand)", () => {
    expect(resolveRaceName({ preferences: { raceName: "Mein Lauf", raceDate: "27.09.2026" }, raceSession, raceYmd: "2026-09-27" })).toBe("Mein Lauf");
    expect(resolveRaceName({ preferences: { raceName: "Mein Lauf", raceDate: "2026-09-27" }, raceSession, raceYmd: "2026-09-27" })).toBe("Mein Lauf");
    expect(resolveRaceName({ preferences: { raceName: "Mein Lauf" }, raceSession, raceYmd: "2026-09-27" })).toBe("Mein Lauf");
  });

  it("behält preferences.raceName, wenn das Rennen des eigenen Plans nicht auf dem Renndatum liegt", () => {
    const own = { raceName: "Testplan Archiv-Flow", raceDate: "18.04.2027" };
    const moved = session("w28-sa", "2027-04-17", "race", { title: "Marathon" });
    expect(
      resolveRaceName({ preferences: own, raceSession: moved, planName: "Marathon – Testplan Archiv-Flow – 18.04.2027", raceYmd: "2027-04-17" }),
    ).toBe("Testplan Archiv-Flow");
  });

  it("Plan A abgeschlossen, Plan B per Wizard angelegt, zurück auf Plan A: Titel ist der von Plan A", () => {
    const before = getPrepCompletionState({ plan: warsawPlan, logs: {}, todayYmd: "2026-10-03", preferences: prefs });
    expect(before).toMatchObject({ status: "completed", raceName: "Warschau Marathon" });

    // Der Wizard ersetzt die Preferences vollständig durch die von Plan B.
    const wizardPrefs = buildIsolatedOnboardingPreferences(
      buildOnboardingPreferencesPatch({
        raceDistanceLabel: "Marathon",
        raceDistanceKm: 42.195,
        raceGoal: "time",
        raceTargetTime: "3:30",
        raceName: "Testplan Archiv-Flow",
        raceDate: "18.04.2027",
        planStartDate: "03.10.2026",
        weeklyKmRange: "40-60",
        userPreferences: [],
      }),
    );
    expect(wizardPrefs.raceName).toBe("Testplan Archiv-Flow");

    // Planwechsel zurück auf A: Plan und Logs sind wieder die von A, die Preferences bleiben die von B.
    const back = getPrepCompletionState({
      plan: warsawPlan,
      logs: {},
      todayYmd: "2026-10-03",
      preferences: wizardPrefs,
      planName: "Marathon – Warschau Marathon – 27.09.2026",
    });
    expect(back).toMatchObject({ status: "completed", raceYmd: "2026-09-27", raceName: "Warschau Marathon" });

    // Plan B selbst behält seinen Namen aus den Preferences.
    const planB = plan([session("w28-so", "2027-04-18", "race", { title: "Marathon", km: 42.2 })]);
    expect(
      getPrepCompletionState({ plan: planB, logs: {}, todayYmd: "2027-04-19", preferences: wizardPrefs }),
    ).toMatchObject({ status: "completed", raceName: "Testplan Archiv-Flow" });
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

describe("Ziel und Distanz des abgeschlossenen Plans", () => {
  const foreignPrefs = {
    raceName: "Testplan Archiv-Flow",
    raceDate: "18.04.2027",
    raceGoal: "time" as const,
    targetTime: "3:30:00",
    raceDistanceKm: 21.1,
  };
  const completedWith = (preferences: Parameters<typeof getPrepCompletionState>[0]["preferences"]) => {
    const state = getPrepCompletionState({ plan: warsawPlan, logs: {}, todayYmd: "2026-10-03", preferences });
    if (state.status !== "completed") throw new Error("expected completed");
    return state;
  };
  const snapshot = (planId: string | null, goalSeconds: number | null): PrepRecapRecord =>
    ({
      planId,
      raceName: "Warschau Marathon",
      raceDate: "2026-09-27",
      finishTimeSeconds: null,
      finishTimeSource: null,
      finishTimeConfirmed: false,
      schemaVersion: 1,
      stats: { race: { name: "Warschau Marathon", ymd: "2026-09-27", distanceKm: 42.195, goalSeconds, completedBy: "race_done" } },
    }) as PrepRecapRecord;

  it("liest Ziel und Distanz nie aus Preferences eines anderen Plans", () => {
    const completed = completedWith(foreignPrefs);
    expect(completed).toMatchObject({ preferencesOwned: false, goalSeconds: null });
    expect(
      resolveCompletedPrepGoal({ completed, raceGoal: "time", preferredDistanceKm: 21.1, record: null, planId: "plan-a" }),
    ).toEqual({ goalSeconds: null, preferredDistanceKm: null, snapshotDistanceKm: null });
  });

  it("fällt auf den Snapshot DIESES Plans zurück, nicht auf den eines anderen", () => {
    const completed = completedWith(foreignPrefs);
    const args = { completed, raceGoal: "time" as const, preferredDistanceKm: 21.1 };
    expect(resolveCompletedPrepGoal({ ...args, record: snapshot("plan-a", 10190), planId: "plan-a" })).toEqual({
      goalSeconds: 10190,
      preferredDistanceKm: null,
      snapshotDistanceKm: 42.195,
    });
    expect(resolveCompletedPrepGoal({ ...args, record: snapshot("plan-x", 10190), planId: "plan-a" }).goalSeconds).toBeNull();
    const otherDate = { ...snapshot("plan-a", 10190), raceDate: "2026-08-30" };
    expect(resolveCompletedPrepGoal({ ...args, record: otherDate, planId: "plan-a" }).goalSeconds).toBeNull();
  });

  it("nimmt die eigenen Preferences vor dem Snapshot", () => {
    const completed = completedWith(prefs);
    expect(
      resolveCompletedPrepGoal({ completed, raceGoal: "time", preferredDistanceKm: 42.195, record: snapshot("plan-a", 9999), planId: "plan-a" }),
    ).toMatchObject({ goalSeconds: 10190, preferredDistanceKm: 42.195 });
  });

  it("hat bei Ziel Finishen keine Zielzeile, auch wenn ein Snapshot ein Ziel trägt", () => {
    const completed = completedWith({ raceGoal: "finish", targetTime: null });
    expect(
      resolveCompletedPrepGoal({ completed, raceGoal: "finish", preferredDistanceKm: null, record: snapshot("plan-a", 10190), planId: "plan-a" })
        .goalSeconds,
    ).toBeNull();
  });
});
