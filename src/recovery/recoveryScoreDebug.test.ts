import {
  applyTrainingConsistencyGuard,
  inferRecoveryScoreDeltaHints,
  type RecoveryScoreContributingFactorsLog,
} from "./recoveryScoreDebug";

function factor(partial: Partial<RecoveryScoreContributingFactorsLog>): RecoveryScoreContributingFactorsLog {
  return {
    base: 60,
    sleep: 70,
    hrv: 55,
    restingHR: 72,
    trainingPenalty: 0,
    todayTrainingPenalty: 0,
    executionNudge: 0,
    smoothing: 2,
    finalScore: 62,
    todayLoadUnits: 0,
    weightedLatentR: 58,
    flatMeanLatentR: 65,
    executionRatio: 0.8,
    confidenceWeight: 0.5,
    loadNudge: 0,
    smoothedLatentR: 60,
    weeklyBlendEffect: 2,
    ...partial,
  };
}

describe("applyTrainingConsistencyGuard", () => {
  const origGuard = process.env.REACT_APP_RECOVERY_GUARD;

  afterEach(() => {
    if (origGuard === undefined) delete process.env.REACT_APP_RECOVERY_GUARD;
    else process.env.REACT_APP_RECOVERY_GUARD = origGuard;
  });

  it("clamps upward move when todayTrainingPenalty is negative and flag is on", () => {
    process.env.REACT_APP_RECOVERY_GUARD = "1";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const r = applyTrainingConsistencyGuard({
      previousScore: 54,
      nextScore: 62,
      todayTrainingPenalty: -4.8,
    });
    warn.mockRestore();
    expect(r.score).toBe(56);
    expect(r.didClamp).toBe(true);
  });

  it("does not clamp when guard flag is off", () => {
    delete process.env.REACT_APP_RECOVERY_GUARD;
    const r = applyTrainingConsistencyGuard({
      previousScore: 54,
      nextScore: 62,
      todayTrainingPenalty: -4.8,
    });
    expect(r.score).toBe(62);
    expect(r.didClamp).toBe(false);
  });

  it("does not clamp when score falls", () => {
    process.env.REACT_APP_RECOVERY_GUARD = "1";
    const r = applyTrainingConsistencyGuard({
      previousScore: 60,
      nextScore: 52,
      todayTrainingPenalty: -5,
    });
    expect(r.score).toBe(52);
    expect(r.didClamp).toBe(false);
  });
});

describe("inferRecoveryScoreDeltaHints", () => {
  it("mentions today training penalty delta", () => {
    const prev = factor({ todayTrainingPenalty: -2 });
    const next = factor({ todayTrainingPenalty: -6 });
    const hints = inferRecoveryScoreDeltaHints(prev, next, { from: 60, to: 55 });
    expect(hints.some((h) => h.includes("Training heute") || h.includes("km"))).toBe(true);
  });

  it("includes km and type when context provided", () => {
    const prev = factor({ todayTrainingPenalty: -1 });
    const next = factor({ todayTrainingPenalty: -5 });
    const hints = inferRecoveryScoreDeltaHints(
      prev,
      next,
      { from: 60, to: 55 },
      { todayDistanceKm: 10.2, trainingTypeLabel: "easy" },
    );
    expect(hints.some((h) => h.includes("10.2") && h.includes("easy"))).toBe(true);
  });
});
