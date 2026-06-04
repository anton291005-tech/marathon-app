import {
  computeMarathonForecast,
  marathonForecastToPredictionResult,
  riegelMarathonSeconds,
} from "./marathonForecast";
import type { PlanWeek, SessionLog } from "./marathonPrediction";
import type { StoredHealthRun } from "./healthRuns";

function session(
  id: string,
  date: string,
  type: string,
  km: number,
): PlanWeek["s"][number] {
  return { id, day: "Mo", date, type, title: type, km, desc: "", pace: null };
}

function makePlan(rows: Array<{ id: string; date: string; type: string; km: number }>): PlanWeek[] {
  return [
    {
      wn: 1,
      phase: "BASE",
      label: "T",
      dates: "T",
      km: 99,
      s: rows.map((r) => session(r.id, r.date, r.type, r.km)),
    },
  ];
}

function doneLog(args: {
  runId: string;
  distanceKm: number;
  durationSec: number;
}): SessionLog {
  return {
    done: true,
    assignedRun: {
      runId: args.runId,
      startDate: "2026-01-01T08:00:00.000Z",
      duration: args.durationSec,
      distanceKm: args.distanceKm,
      canonicalActivityType: "run",
    },
  };
}

function healthRun(runId: string, durationSec: number, distanceKm: number): StoredHealthRun {
  return {
    runId,
    workoutType: "running",
    duration: durationSec,
    distanceMeters: distanceKm * 1000,
    distanceUnknown: false,
    startDate: "2026-01-01T08:00:00.000Z",
  };
}

describe("riegelMarathonSeconds", () => {
  it("extrapolates marathon time from half-marathon effort", () => {
    const halfSec = 90 * 60;
    const pred = riegelMarathonSeconds(halfSec, 21.0975);
    expect(pred).toBeGreaterThan(halfSec);
    expect(pred).toBeLessThan(halfSec * 2.2);
  });
});

describe("computeMarathonForecast", () => {
  const now = new Date("2026-03-15T12:00:00.000Z");

  it("is not ready without pace samples (no target-time fallback)", () => {
    const plan = makePlan([
      { id: "a", date: "10. Mar", type: "long", km: 20 },
      { id: "b", date: "5. Mar", type: "long", km: 18 },
    ]);
    const logs: Record<string, SessionLog> = {
      a: { done: true, actualKm: "20" },
      b: { done: true, actualKm: "18" },
    };
    const forecast = computeMarathonForecast({ plan, logs, healthRuns: [], now, targetSeconds: 10090 });
    expect(forecast.ready).toBe(false);
    expect(forecast.predictedSeconds).toBeNull();
  });

  it("predicts from segmented easy/long paces instead of Riegel on slow runs", () => {
    const plan = makePlan([
      { id: "slow", date: "8. Mar", type: "long", km: 20 },
      { id: "fast", date: "12. Mar", type: "long", km: 22 },
    ]);
    const logs: Record<string, SessionLog> = {
      slow: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * 360 }),
      fast: doneLog({ runId: "r2", distanceKm: 22, durationSec: 22 * 300 }),
    };
    const healthRuns = [
      healthRun("r1", 20 * 360, 20),
      healthRun("r2", 22 * 300, 22),
    ];
    const forecast = computeMarathonForecast({ plan, logs, healthRuns, now });
    const avgEasyPace = (360 + 300) / 2;
    const trainingBaseSeconds = avgEasyPace * 0.88 * 42.195;
    expect(forecast.ready).toBe(true);
    expect(forecast.predictedSeconds).not.toBeNull();
    expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(trainingBaseSeconds * 0.95);
    expect(forecast.predictedSeconds!).toBeLessThanOrEqual(trainingBaseSeconds * 1.25);
  });

  it("anchors easy-only training to a historical marathon PR", () => {
    const easyPaceSecPerKm = 5 * 60 + 45;
    const plan = makePlan([
      { id: "a", date: "8. Mar", type: "easy", km: 20 },
      { id: "b", date: "12. Mar", type: "long", km: 22 },
    ]);
    const logs: Record<string, SessionLog> = {
      a: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * easyPaceSecPerKm }),
      b: doneLog({ runId: "r2", distanceKm: 22, durationSec: 22 * easyPaceSecPerKm }),
    };
    const healthRuns = [
      healthRun("r1", 20 * easyPaceSecPerKm, 20),
      healthRun("r2", 22 * easyPaceSecPerKm, 22),
    ];
    const forecast = computeMarathonForecast({
      plan,
      logs,
      healthRuns,
      now,
      personalBestSeconds: 3 * 3600,
    });
    expect(forecast.ready).toBe(true);
    expect(forecast.predictedSeconds).not.toBeNull();
    expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(3 * 3600 + 10 * 60);
    expect(forecast.predictedSeconds!).toBeLessThanOrEqual(3 * 3600 + 35 * 60);
    expect(forecast.sub250ProbabilityPercent).toBeLessThanOrEqual(20);
  });

  it("uses tempo sessions for a faster race-pace based forecast", () => {
    const tempoPaceSecPerKm = 3 * 60 + 40;
    const plan = makePlan([
      { id: "easy", date: "8. Mar", type: "easy", km: 20 },
      { id: "tempo", date: "12. Mar", type: "tempo", km: 12 },
    ]);
    const logs: Record<string, SessionLog> = {
      easy: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * (5 * 60 + 45) }),
      tempo: doneLog({ runId: "r2", distanceKm: 12, durationSec: 12 * tempoPaceSecPerKm }),
    };
    const healthRuns = [
      healthRun("r1", 20 * (5 * 60 + 45), 20),
      healthRun("r2", 12 * tempoPaceSecPerKm, 12),
    ];
    const forecast = computeMarathonForecast({ plan, logs, healthRuns, now });
    const trainingBaseSeconds = tempoPaceSecPerKm * 1.04 * 42.195;
    expect(forecast.ready).toBe(true);
    expect(forecast.predictedSeconds!).toBeLessThan(3 * 3600 + 15 * 60);
    expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(trainingBaseSeconds * 0.95);
    expect(forecast.sub250ProbabilityPercent).toBeGreaterThan(10);
  });

  it("maps to MarathonPredictionResult for UI cards", () => {
    const plan = makePlan([
      { id: "a", date: "8. Mar", type: "long", km: 20 },
      { id: "b", date: "12. Mar", type: "long", km: 22 },
    ]);
    const logs: Record<string, SessionLog> = {
      a: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * 360 }),
      b: doneLog({ runId: "r2", distanceKm: 22, durationSec: 22 * 300 }),
    };
    const healthRuns = [healthRun("r1", 20 * 360, 20), healthRun("r2", 22 * 300, 22)];
    const ui = marathonForecastToPredictionResult(
      computeMarathonForecast({ plan, logs, healthRuns, now }),
    );
    expect(ui.ready).toBe(true);
    expect(ui.predictedTime).toMatch(/^\d+:\d{2}:\d{2}$/);
    expect(ui.rangeLabel).toBeTruthy();
    expect(ui.consistencyScore).not.toBeNull();
  });

  it("clamps forecast between 2:20 and 5:00", () => {
    const plan = makePlan([
      { id: "a", date: "8. Mar", type: "long", km: 10 },
      { id: "b", date: "12. Mar", type: "long", km: 10 },
    ]);
    const logs: Record<string, SessionLog> = {
      a: doneLog({ runId: "r1", distanceKm: 10, durationSec: 10 * 720 }),
      b: doneLog({ runId: "r2", distanceKm: 10, durationSec: 10 * 720 }),
    };
    const healthRuns = [healthRun("r1", 10 * 720, 10), healthRun("r2", 10 * 720, 10)];
    const forecast = computeMarathonForecast({ plan, logs, healthRuns, now });
    expect(forecast.ready).toBe(true);
    expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(2 * 3600 + 20 * 60);
    expect(forecast.predictedSeconds!).toBeLessThanOrEqual(5 * 3600);
  });
});
