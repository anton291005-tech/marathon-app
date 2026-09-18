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

  it("anchors the forecast to a recent half-marathon race result instead of slow training long runs", () => {
    const longPaceSecPerKm = 360; // 6:00/km, deliberately slow training pace
    const raceDurationSec = 1 * 3600 + 25 * 60 + 37; // 1:25:37
    const raceDistanceKm = 21.0975;

    const planWithRace = makePlan([
      { id: "a", date: "8. Mar", type: "long", km: 20 },
      { id: "b", date: "12. Mar", type: "long", km: 20 },
      { id: "race", date: "1. Feb", type: "race", km: 21 },
    ]);
    const logsWithRace: Record<string, SessionLog> = {
      a: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * longPaceSecPerKm }),
      b: doneLog({ runId: "r2", distanceKm: 20, durationSec: 20 * longPaceSecPerKm }),
      race: doneLog({ runId: "race1", distanceKm: raceDistanceKm, durationSec: raceDurationSec }),
    };
    const healthRunsWithRace = [
      healthRun("r1", 20 * longPaceSecPerKm, 20),
      healthRun("r2", 20 * longPaceSecPerKm, 20),
      healthRun("race1", raceDurationSec, raceDistanceKm),
    ];
    const withRace = computeMarathonForecast({ plan: planWithRace, logs: logsWithRace, healthRuns: healthRunsWithRace, now });

    const planNoRace = makePlan([
      { id: "a", date: "8. Mar", type: "long", km: 20 },
      { id: "b", date: "12. Mar", type: "long", km: 20 },
    ]);
    const logsNoRace: Record<string, SessionLog> = { a: logsWithRace.a, b: logsWithRace.b };
    const healthRunsNoRace = [healthRunsWithRace[0], healthRunsWithRace[1]];
    const withoutRace = computeMarathonForecast({ plan: planNoRace, logs: logsNoRace, healthRuns: healthRunsNoRace, now });

    expect(withRace.ready).toBe(true);
    expect(withoutRace.ready).toBe(true);
    // The race result is a far stronger fitness signal than deliberately slow training long
    // runs — it must pull the forecast meaningfully faster, not get diluted away by them.
    expect(withRace.predictedSeconds!).toBeLessThan(withoutRace.predictedSeconds! - 1200);
    // Riegel extrapolation from the race lands around 2:58 — the blended forecast should be
    // close to that, not near the ~3:20+ training-only guess.
    expect(withRace.predictedSeconds!).toBeLessThan(3 * 3600 + 15 * 60);
  });

  it("is ready from a single race result alone, with no other pace samples", () => {
    const raceDurationSec = 1 * 3600 + 25 * 60 + 37;
    const raceDistanceKm = 21.0975;
    const plan = makePlan([{ id: "race", date: "1. Feb", type: "race", km: 21 }]);
    const logs: Record<string, SessionLog> = {
      race: doneLog({ runId: "race1", distanceKm: raceDistanceKm, durationSec: raceDurationSec }),
    };
    const healthRuns = [healthRun("race1", raceDurationSec, raceDistanceKm)];
    const forecast = computeMarathonForecast({ plan, logs, healthRuns, now });
    expect(forecast.ready).toBe(true);
    expect(forecast.predictedSeconds!).toBeLessThan(3 * 3600 + 15 * 60);
  });

  it("ignores a race result older than the 120-day anchor window (falls back to training-only)", () => {
    const oldRaceNow = new Date("2026-11-20T12:00:00.000Z"); // "1. Jun" is ~172 days before this
    const longPaceSecPerKm = 360;
    const raceDurationSec = 1 * 3600 + 25 * 60 + 37;
    const raceDistanceKm = 21.0975;

    const planWithOldRace = makePlan([
      { id: "a", date: "8. Nov", type: "long", km: 20 },
      { id: "b", date: "12. Nov", type: "long", km: 20 },
      { id: "race", date: "1. Jun", type: "race", km: 21 },
    ]);
    const logs: Record<string, SessionLog> = {
      a: doneLog({ runId: "r1", distanceKm: 20, durationSec: 20 * longPaceSecPerKm }),
      b: doneLog({ runId: "r2", distanceKm: 20, durationSec: 20 * longPaceSecPerKm }),
      race: doneLog({ runId: "race1", distanceKm: raceDistanceKm, durationSec: raceDurationSec }),
    };
    const healthRuns = [
      healthRun("r1", 20 * longPaceSecPerKm, 20),
      healthRun("r2", 20 * longPaceSecPerKm, 20),
      healthRun("race1", raceDurationSec, raceDistanceKm),
    ];
    const withOldRace = computeMarathonForecast({ plan: planWithOldRace, logs, healthRuns, now: oldRaceNow });

    const planNoRace = makePlan([
      { id: "a", date: "8. Nov", type: "long", km: 20 },
      { id: "b", date: "12. Nov", type: "long", km: 20 },
    ]);
    const logsNoRace: Record<string, SessionLog> = { a: logs.a, b: logs.b };
    const healthRunsNoRace = [healthRuns[0], healthRuns[1]];
    const withoutRace = computeMarathonForecast({ plan: planNoRace, logs: logsNoRace, healthRuns: healthRunsNoRace, now: oldRaceNow });

    expect(withOldRace.predictedSeconds).toBe(withoutRace.predictedSeconds);
  });

  describe("volume factor is driven by the 42-day window, not the running calendar week", () => {
    // now = Tue 16. Jun 2026 — current week Mon 15. – Sun 21. Jun.
    const nowJune = new Date("2026-06-16T12:00:00.000Z");
    const pace = 13298 / (0.88 * 42.195); // ~358.13 s/km — shared by every non-race sample
                                            // so the training base averages to exactly 13298s.
    const raceDistanceKm = 21.0975;
    const raceDurationSec = 10482 / Math.pow(42.195 / raceDistanceKm, 1.06); // riegel(...) === 10482

    // 42-day window: 6 done runs (planned = 100 km, actual = 100 km) + 1 open run (planned
    // 14.548 km) -> window42Adherence = 100 / 114.548 = 0.873. Completion 6/7 and kmAdherence 1
    // (done runs only) give consistencyScore = round(42*6/7 + 38 + 20) = 94.
    // The 50 km of actual distance shared by the two most recent weeks is split by
    // `weekZeroActualKm`, so the current-week ratio can vary without touching the window totals.
    const WINDOW42 = 100 / (100 + 14.548);
    const RECOVERY_FACTOR = 0.99848; // homeRecoveryScore 52
    const CONSISTENCY_PENALTY = ((100 - 94) / 100) * 120; // 7.2s

    function buildRows(weekZeroActualKm: number) {
      return [
        // race anchor, 70 days back: outside the 42-day window, inside the 120-day anchor window.
        { id: "race", date: "7. Apr", type: "race", km: 21, actualKm: raceDistanceKm, durationSec: raceDurationSec },
        // sets maxLongRunKm to 26 (-> longRunDepthFactor 1), 50 days back: outside the 42-day window.
        { id: "long", date: "27. Apr", type: "long", km: 26, actualKm: 26, durationSec: 26 * pace },
        { id: "w3a", date: "25. Mai", type: "easy", km: 10, actualKm: 10, durationSec: 10 * pace },
        { id: "w3b", date: "26. Mai", type: "easy", km: 10, actualKm: 10, durationSec: 10 * pace },
        { id: "w3c", date: "27. Mai", type: "easy", km: 10, actualKm: 10, durationSec: 10 * pace },
        { id: "w3open", date: "28. Mai", type: "easy", km: 14.548, actualKm: null, durationSec: 0 },
        { id: "w2", date: "2. Jun", type: "easy", km: 20, actualKm: 20, durationSec: 20 * pace },
        { id: "w1", date: "9. Jun", type: "easy", km: 25, actualKm: 50 - weekZeroActualKm, durationSec: (50 - weekZeroActualKm) * pace },
        // current week — its actual/planned ratio is what the old code used for the volume factor
        { id: "w0", date: "16. Jun", type: "easy", km: 25, actualKm: weekZeroActualKm, durationSec: weekZeroActualKm * pace },
      ];
    }

    type Row = ReturnType<typeof buildRows>[number] | {
      id: string; date: string; type: string; km: number; actualKm: number | null; durationSec: number;
    };

    function forecastFromRows(rows: Row[], personalBestSeconds = 10851) {
      const plan = makePlan(rows);
      const logs: Record<string, SessionLog> = {};
      const healthRuns: StoredHealthRun[] = [];
      for (const r of rows) {
        if (r.actualKm == null) continue; // open, not-done session
        logs[r.id] = doneLog({ runId: `${r.id}-run`, distanceKm: r.actualKm, durationSec: r.durationSec });
        healthRuns.push(healthRun(`${r.id}-run`, r.durationSec, r.actualKm));
      }
      return computeMarathonForecast({
        plan,
        logs,
        healthRuns,
        now: nowJune,
        personalBestSeconds,
        homeRecoveryScore0_100: 52, // -> recoveryTimeFactor === 0.99848
      });
    }

    // Expected value from the volume-factor formula (adherence < 0.88 branch): 1 + 0.1 * (1 - adherence).
    // anchor 10482 * volume * longRun 1 * recovery 0.99848 + consistency penalty 7.2s.
    const expectedWith42 = 10482 * (1 + 0.1 * (1 - WINDOW42)) * RECOVERY_FACTOR + CONSISTENCY_PENALTY; // ~10606s

    it("uses window42Adherence (0.873 -> factor ~1.0127) while the current week is at 0.512", () => {
      const forecast = forecastFromRows(buildRows(12.8));
      expect(forecast.ready).toBe(true);
      expect(forecast.consistencyScore).toBe(94);
      expect(forecast.weeklyVolumeAdherence).toBeCloseTo(0.512, 3);
      // anchor 10482s (training base 13298s is slower and must not dilute it).
      expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(Math.floor(expectedWith42) - 2);
      expect(forecast.predictedSeconds!).toBeLessThanOrEqual(Math.ceil(expectedWith42) + 2);
    });

    it("gives the same result when the current week is neutral (1.0)", () => {
      const forecast = forecastFromRows(buildRows(25));
      expect(forecast.consistencyScore).toBe(94);
      expect(forecast.weeklyVolumeAdherence).toBeCloseTo(1, 3);
      expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(Math.floor(expectedWith42) - 2);
      expect(forecast.predictedSeconds!).toBeLessThanOrEqual(Math.ceil(expectedWith42) + 2);
    });

    it("is independent of weeklyVolumeAdherence: 0.512 and 1.0 give identical predictions", () => {
      const partialWeek = forecastFromRows(buildRows(12.8));
      const neutralWeek = forecastFromRows(buildRows(25));
      expect(partialWeek.weeklyVolumeAdherence).not.toBeCloseTo(neutralWeek.weeklyVolumeAdherence!, 2);
      expect(partialWeek.predictedSeconds).toBe(neutralWeek.predictedSeconds);
    });

    it("applies a neutral volume factor (1.0) when window42Adherence is missing", () => {
      // No running session inside the 42-day window -> window42Adherence null. A planned session
      // later this week (Sat 20. Jun, not yet due) still gives weeklyVolumeAdherence 0 -> the old
      // code would have applied 1 + 0.1 * (1 - 0.5) = 1.05.
      const rows: Row[] = [
        { id: "race", date: "7. Apr", type: "race", km: 21, actualKm: raceDistanceKm, durationSec: raceDurationSec },
        { id: "long", date: "27. Apr", type: "long", km: 26, actualKm: 26, durationSec: 26 * pace },
        { id: "future", date: "20. Jun", type: "easy", km: 25, actualKm: null, durationSec: 0 },
      ];
      const forecast = forecastFromRows(rows);
      expect(forecast.ready).toBe(true);
      expect(forecast.weeklyVolumeAdherence).toBeCloseTo(0, 3);
      expect(forecast.consistencyScore).toBe(0); // no sessions in the window -> 120s penalty
      const expected = 10482 * 1 * 1 * RECOVERY_FACTOR + 120; // ~10583s, volume factor exactly 1.0
      expect(forecast.predictedSeconds!).toBeGreaterThanOrEqual(Math.floor(expected) - 2);
      expect(forecast.predictedSeconds!).toBeLessThanOrEqual(Math.ceil(expected) + 2);
    });
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
