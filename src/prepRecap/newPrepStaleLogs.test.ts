/**
 * Regression: nach „Neue Vorbereitung starten" zeigte Home für den neuen, HEUTE startenden Plan
 * „Vorbereitung abgeschlossen" samt Fortschritt/km/Serie der alten Vorbereitung.
 *
 * Ursache: KI-Pläne vergeben Session-IDs nach Woche/Wochentag (`w5-mo`), die in jedem Plan gleich
 * sind. Logs hängen nur an der Session-ID, also „passten" die alten Logs auf den neuen Plan.
 * Fix: Logs von vor dem Planstart gehören nicht zum Plan (scopeSessionLogsToPlan) — Home liest nur
 * diese Plan-Sicht, und der Wizard-Abschluss übernimmt sie nicht.
 */

import { getConsistencyStats, isSessionLogDone } from "../appSmartFeatures";
import type { PlanSession, PlanWeek, SessionLog } from "../marathonPrediction";
import { detachSessionLogsFromPlan } from "../onboarding/onboardingPlanIsolation";
import type { TrainingPlanV2 } from "../planV2/types";
import { computeTrainingProgressPct } from "../selectors/trainingProgress";
import { logsNotBeforeForSuccessorPlan, scopeSessionLogsToPlan } from "../sessionLogs/scopeSessionLogsToPlan";
import { getPrepCompletionState } from "./prepCompletionState";

const TODAY = "2026-10-02"; // Freitag — Planstart
const NEW_RACE_DAY = "2026-12-20";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function session(id: string, dateIso: string, type: string, km = 10): PlanSession {
  const [, m, d] = dateIso.split("-").map(Number);
  return { id, day: "So", date: `${d}. ${MONTHS[m - 1]}`, dateIso, type, title: type, km };
}

function toPlanV2(sessions: PlanSession[]): TrainingPlanV2 {
  return {
    version: 2,
    workouts: sessions.map((s) => ({
      id: s.id,
      dateIso: `${s.dateIso}T10:00:00.000Z`,
      sport: "run",
      sessionType: s.type,
      title: s.title,
      km: s.km,
    })),
    weeks: [],
  } as TrainingPlanV2;
}

/** Neuer Plan, startet heute: Woche 1 mit 3 Einheiten, Zielrennen in Woche 12. */
const newPlanSessions: PlanSession[] = [
  session("w1-fr", "2026-10-02", "easy", 6),
  session("w1-sa", "2026-10-03", "easy", 8),
  session("w1-so", "2026-10-04", "long", 14),
  session("w5-mi", "2026-10-28", "tempo", 10),
  session("w5-so", "2026-11-01", "long", 22),
  session("w12-sa", "2026-12-19", "easy", 4),
  session("w12-so", NEW_RACE_DAY, "race", 21.1),
];

const newDisplayPlan: PlanWeek[] = [
  { wn: 1, phase: "base", km: 28, s: newPlanSessions.slice(0, 3) },
  { wn: 5, phase: "build", km: 32, s: newPlanSessions.slice(3, 5) },
  { wn: 12, phase: "taper", km: 25, s: newPlanSessions.slice(5) },
];

const newPlanV2 = toPlanV2(newPlanSessions);

/** Erledigt und geloggt am Kalendertag `ymd` (wie quickComplete/Modal: `at` = Zeitpunkt des Loggens). */
const done = (km: string, ymd: string): SessionLog => ({
  feeling: 4,
  actualKm: km,
  notes: "",
  done: true,
  skipped: false,
  at: `${ymd}T08:30:00.000Z`,
});

/** Logs der ALTEN Vorbereitung (Warschau, 25 Wochen) — gleiche ID-Slots wie im neuen Plan. */
const oldPrepLogs: Record<string, SessionLog> = {
  "w5-mi": done("12", "2026-07-08"),
  "w5-so": done("28", "2026-07-12"),
  "w12-sa": done("8", "2026-08-29"),
  "w12-so": done("32", "2026-08-30"), // alter Long Run auf dem Slot des neuen Zielrennens
  "w25-so": done("42.2", "2026-09-27"), // altes Zielrennen, im neuen Plan nicht vorhanden
};

const prefs = { raceName: "Winterhalbmarathon", raceGoal: "finish" as const, targetTime: null };

describe("neue Vorbereitung, Plan startet heute — alte Logs dürfen nicht anhaften", () => {
  it("übernimmt beim Wizard-Abschluss keine Logs der alten Vorbereitung in den neuen Plan", () => {
    expect(detachSessionLogsFromPlan(oldPrepLogs, newPlanV2)).toEqual({});
  });

  it("Home ist „active“: ein Rennen in der Zukunft kann nicht erledigt sein", () => {
    // Home liest die Plan-Sicht der Logs (AppMain: `logs` = scopeSessionLogsToPlan(storedLogs, plan)).
    const state = getPrepCompletionState({
      plan: newDisplayPlan,
      logs: scopeSessionLogsToPlan(oldPrepLogs, newPlanV2),
      todayYmd: TODAY,
      preferences: prefs,
    });
    expect(state.status).toBe("active");
  });

  it("Plan-Fortschritt und erledigte Einheiten stehen am Starttag auf 0", () => {
    const logs = detachSessionLogsFromPlan(oldPrepLogs, newPlanV2);
    expect(computeTrainingProgressPct({ planSessions: newPlanSessions, logs })).toBe(0);
    expect(newPlanSessions.filter((s) => isSessionLogDone(logs[s.id]))).toHaveLength(0);
  });

  it("Serie und erledigte Einheiten bleiben auch mit Alt-Logs im Bestand bei 0 (Plan-Sicht)", () => {
    const logs = scopeSessionLogsToPlan(oldPrepLogs, newPlanV2);
    expect(newPlanSessions.filter((s) => isSessionLogDone(logs[s.id]))).toHaveLength(0);
    expect(getConsistencyStats(newDisplayPlan, logs, new Date(2026, 9, 2, 12)).sessionStreak).toBe(0);
  });

  it("Zielrennen am Renntag erledigt, neuer Plan startet am selben Tag: kein Hero, nichts übernommen", () => {
    // Gleich langer neuer Plan: der Renn-Slot `w12-so` hat dieselbe ID wie das alte Zielrennen.
    const raceDayLog: Record<string, SessionLog> = {
      "w12-so": { done: true, skipped: false, actualKm: "21.1", at: `${TODAY}T11:40:00.000Z` },
    };
    // Wizard am Abend abgeschlossen: alten Plan archiviert, Sekunden später den neuen angelegt.
    expect(detachSessionLogsFromPlan(raceDayLog, newPlanV2, `${TODAY}T18:00:00.000Z`)).toEqual({});
    // Nach App-Neustart kommt der Log über session_logs zurück — die Archivierung bleibt die Grenze.
    const notBefore = logsNotBeforeForSuccessorPlan(`${TODAY}T18:00:04.000Z`, [{ archived_at: `${TODAY}T18:00:01.000Z` }]);
    const logs = scopeSessionLogsToPlan(raceDayLog, newPlanV2, notBefore);
    expect(logs).toEqual({});
    expect(
      getPrepCompletionState({ plan: newDisplayPlan, logs, todayYmd: TODAY, preferences: prefs }).status,
    ).toBe("active");
  });

  it("registrierter Gast: eigene Logs vom Starttag bleiben, auch wenn die Planzeile erst danach entsteht", () => {
    // Gast legt den Plan morgens an, erledigt abends w1-fr, registriert sich um 20:00 — die Migration
    // legt die Planzeile (created_at) erst dann an. Ohne Archiv gibt es keine Nachfolger-Grenze.
    const guestLogs: Record<string, SessionLog> = { "w1-fr": done("6", TODAY) };
    const notBefore = logsNotBeforeForSuccessorPlan(`${TODAY}T20:00:00.000Z`, []);
    const logs = scopeSessionLogsToPlan(guestLogs, newPlanV2, notBefore);
    expect(logs).toBe(guestLogs);
    expect(computeTrainingProgressPct({ planSessions: newPlanSessions, logs })).toBeGreaterThan(0);
  });

  it("Woche 1 ist auch mit anhaftenden Alt-Logs 0/3 (deshalb wirkte der Woche-Tab korrekt)", () => {
    const week1 = newDisplayPlan[0].s;
    expect(week1.filter((s) => isSessionLogDone(oldPrepLogs[s.id]))).toHaveLength(0);
  });
});

describe("abgeschlossener Plan ohne Nachfolger", () => {
  const warsawSessions: PlanSession[] = [
    session("w1-mo", "2026-04-13", "easy", 8),
    session("w5-mi", "2026-05-13", "tempo", 12),
    session("w25-sa", "2026-09-26", "easy", 5),
    session("w25-so", "2026-09-27", "race", 42.2),
  ];
  const warsawPlanV2 = toPlanV2(warsawSessions);
  const warsawDisplayPlan: PlanWeek[] = [{ wn: 25, phase: "taper", km: 67, s: warsawSessions }];
  const warsawLogs: Record<string, SessionLog> = {
    "w1-mo": done("8", "2026-04-13"),
    "w5-mi": done("12", "2026-05-13"),
    "w25-sa": done("5", "2026-09-26"),
    "w25-so": done("42.2", "2026-09-27"),
  };

  it("zeigt weiter den Hero: die eigenen Logs bleiben in der Plan-Sicht", () => {
    // Kein Nachfolger: der Plan ist aktiv, nichts archiviert → keine Nachfolger-Grenze.
    const notBefore = logsNotBeforeForSuccessorPlan("2026-04-01T09:00:00.000Z", []);
    const logs = scopeSessionLogsToPlan(warsawLogs, warsawPlanV2, notBefore);
    expect(logs).toBe(warsawLogs);
    const state = getPrepCompletionState({
      plan: warsawDisplayPlan,
      logs,
      todayYmd: "2026-10-03",
      preferences: { raceName: "Warschau Marathon", raceGoal: "time" as const, targetTime: "2:49:50" },
    });
    expect(state.status).toBe("completed");
    expect(state.status === "completed" && state.completedBy).toBe("race_done");
    expect(computeTrainingProgressPct({ planSessions: warsawSessions, logs })).toBe(100);
  });
});
