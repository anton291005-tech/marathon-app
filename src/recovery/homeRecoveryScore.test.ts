import { computeHomeRecoveryScore, computeHomeRecoveryScoreBreakdown, computeHomeRecoveryScoreFromInputs } from "./homeRecoveryScore";

describe("computeHomeRecoveryScore", () => {
  it("returns null when required inputs missing", () => {
    expect(
      computeHomeRecoveryScoreFromInputs({
        sleepHours: null,
        hrvMs: 50,
        restingHr: null,
        activeEnergyKcal: null,
      }),
    ).toBeNull();
    expect(
      computeHomeRecoveryScoreFromInputs({
        sleepHours: 7,
        hrvMs: null,
        restingHr: null,
        activeEnergyKcal: 500,
      }),
    ).toBeNull();
  });

  it("returns deterministic score for same inputs", () => {
    const inputs = { sleepHours: 7.2, hrvMs: 52, restingHr: null, activeEnergyKcal: 420 };
    const a = computeHomeRecoveryScoreFromInputs(inputs);
    const b = computeHomeRecoveryScoreFromInputs(inputs);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("computeHomeRecoveryScore delegates to inputs only", () => {
    const r = computeHomeRecoveryScore({
      todayYmd: "2026-04-20",
      inputs: { sleepHours: 7, hrvMs: null, restingHr: 55, activeEnergyKcal: null },
    });
    expect(r.score).toBe(computeHomeRecoveryScoreFromInputs({ sleepHours: 7, hrvMs: null, restingHr: 55, activeEnergyKcal: null }));
  });

  it("breakdown score matches computeHomeRecoveryScore", () => {
    const a = computeHomeRecoveryScore({
      todayYmd: "2026-04-20",
      inputs: { sleepHours: 7.1, hrvMs: 48, restingHr: null, activeEnergyKcal: 300 },
    });
    const b = computeHomeRecoveryScoreBreakdown({
      todayYmd: "2026-04-20",
      inputs: { sleepHours: 7.1, hrvMs: 48, restingHr: null, activeEnergyKcal: 300 },
    });
    expect(b.score).toBe(a.score);
  });

  // Note: no cold-start blending, inertia, or clamp guards in strict mode.
});
