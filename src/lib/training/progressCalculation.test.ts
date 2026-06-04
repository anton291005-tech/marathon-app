import type { PlanSession, SessionLog, PlanWeek } from "../../marathonPrediction";
import { computePlanAdherenceScore } from "../../coach/adherenceScore";
import {
  computeTrainableWholePlanProgressPct,
  isSessionCompletedForPlanProgress,
} from "./progressCalculation";

function trainingSession(id: string, date = "10. Mai", type: PlanSession["type"] = "easy"): PlanSession {
  return { id, day: "Mo", date, type, title: "Einheit", km: 10, desc: "", pace: null };
}

function singleWeekPlan(sessions: PlanSession[], wn = 1): PlanWeek[] {
  return [{ wn, phase: "BASE", km: 10, s: sessions }];
}

describe("progressCalculation (ring)", () => {
  test("TEST 1: 60 total, 35 completed, 5 skipped, 20 future-style open → 58%", () => {
    const sessions = Array.from({ length: 60 }, (_, i) => trainingSession(`s${i}`, `${((i % 28) + 1).toString()}. Mai`));
    const logs: Record<string, SessionLog | undefined> = {};
    for (let i = 0; i < 35; i += 1) logs[`s${i}`] = { done: true, at: "2026-05-01T12:00:00.000Z" };
    for (let i = 35; i < 40; i += 1) logs[`s${i}`] = { skipped: true, done: false, at: "2026-05-02T12:00:00.000Z" };
    expect(computeTrainableWholePlanProgressPct(sessions, logs)).toBe(58);
  });

  test("TEST 2: Skipping zählt im Nenner — vorher 36/60, nachher 35/60 (nicht 35/59)", () => {
    const sessions = Array.from({ length: 60 }, (_, i) => trainingSession(`s${i}`));
    const before: Record<string, SessionLog | undefined> = {};
    for (let i = 0; i < 36; i += 1) before[`s${i}`] = { done: true, at: "2026-05-01T12:00:00.000Z" };
    expect(computeTrainableWholePlanProgressPct(sessions, before)).toBe(60);
    const after = { ...before };
    after.s35 = { skipped: true, done: false, at: "2026-05-02T12:00:00.000Z" };
    expect(computeTrainableWholePlanProgressPct(sessions, after)).toBe(58);
  });

  test("TEST 3: 10 Sessions, 0 erledigt, alle noch offen → 0/10 = 0%", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => trainingSession(`f${i}`, `${i + 1}. Jun`));
    expect(computeTrainableWholePlanProgressPct(sessions, {})).toBe(0);
  });

  test("TEST 7: 58 done, 2 skipped → 97%", () => {
    const sessions = Array.from({ length: 60 }, (_, i) => trainingSession(`s${i}`));
    const logs: Record<string, SessionLog | undefined> = {};
    for (let i = 0; i < 58; i += 1) logs[`s${i}`] = { done: true };
    logs.s58 = { skipped: true, done: false };
    logs.s59 = { skipped: true, done: false };
    expect(computeTrainableWholePlanProgressPct(sessions, logs)).toBe(97);
  });

  test("assignedRun.runId zählt als abgeschlossen", () => {
    const s = trainingSession("a");
    expect(
      isSessionCompletedForPlanProgress({
        done: false,
        assignedRun: { runId: "health-123", startDate: "", duration: 0, distanceKm: 0 },
        at: "2026-05-04T08:00:00.000Z",
      }),
    ).toBe(true);
    expect(computeTrainableWholePlanProgressPct([s], {})).toBe(0);
    expect(
      computeTrainableWholePlanProgressPct([s], {
        a: { done: false, assignedRun: { runId: "x", startDate: "", duration: 0, distanceKm: 0 } },
      }),
    ).toBe(100);
  });
});

describe("progressCalculation (Plan & Umsetzung score via coach)", () => {
  const healthRuns: never[] = [];
  const nowMidMay = new Date("2026-05-15T12:00:00.000Z");

  test("TEST 4: Zukunft zählt nicht — 5 vergangene (alle done), 5 zukünftige → 100", () => {
    const past = [1, 2, 3, 4, 5].map((d) => trainingSession(`p${d}`, `${d}. Mai`));
    const fut = [1, 2, 3, 4, 5].map((d) => trainingSession(`u${d}`, `${d}. Jun`));
    const plan = singleWeekPlan([...past, ...fut]);
    const logs: Record<string, SessionLog | undefined> = Object.fromEntries(
      past.map((s) => [s.id, { done: true, at: "2026-05-01T12:00:00.000Z" }]),
    );
    const r = computePlanAdherenceScore({ plan, logs, healthRuns, now: nowMidMay });
    expect(r.score).toBe(100);
    expect(r.dueTotal).toBe(5);
    expect(r.dueCompleted).toBe(5);
  });

  test("TEST 5: 5 vergangene (3 done, 2 verpasst), 5 Zukunft → 60", () => {
    const past = [1, 2, 3, 4, 5].map((d) => trainingSession(`p${d}`, `${d}. Mai`));
    const fut = [1, 2, 3, 4, 5].map((d) => trainingSession(`u${d}`, `${d}. Jun`));
    const plan = singleWeekPlan([...past, ...fut]);
    const logs: Record<string, SessionLog | undefined> = {
      p1: { done: true, at: "2026-05-01T12:00:00.000Z" },
      p2: { done: true, at: "2026-05-02T12:00:00.000Z" },
      p3: { done: true, at: "2026-05-03T12:00:00.000Z" },
    };
    const r = computePlanAdherenceScore({ plan, logs, healthRuns, now: nowMidMay });
    expect(r.score).toBe(60);
    expect(r.dueTotal).toBe(5);
    expect(r.dueCompleted).toBe(3);
  });

  test("TEST 6: Tag 1 — noch nichts fällig → 100", () => {
    const onlyFuture = [1, 2, 3, 4, 5].map((d) => trainingSession(`u${d}`, `${d}. Jun`));
    const plan = singleWeekPlan(onlyFuture);
    const r = computePlanAdherenceScore({ plan, logs: {}, healthRuns, now: nowMidMay });
    expect(r.score).toBe(100);
    expect(r.dueTotal).toBe(0);
  });
});
