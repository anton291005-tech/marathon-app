import { computeHomeRecoveryScoreFromInputs, normalizeHomeRecoveryInputs } from "./homeRecoveryScore";

describe("normalizeHomeRecoveryInputs", () => {
  it("invalid roots become explicit nulls", () => {
    const empty = { sleepHours: null, hrvMs: null, restingHr: null, activeEnergyKcal: null };
    expect(normalizeHomeRecoveryInputs(null)).toEqual(empty);
    expect(normalizeHomeRecoveryInputs(undefined)).toEqual(empty);
    expect(normalizeHomeRecoveryInputs("x")).toEqual(empty);
    expect(normalizeHomeRecoveryInputs([])).toEqual(empty);
  });

  it("preserves semantics of already-valid objects for scoring", () => {
    const raw = { sleepHours: 7.2, hrvMs: 50, restingHr: null, activeEnergyKcal: 0 };
    expect(computeHomeRecoveryScoreFromInputs(normalizeHomeRecoveryInputs(raw))).toBe(
      computeHomeRecoveryScoreFromInputs(raw),
    );
  });

  it("maps NaN / Infinity to null (explicit missing signal)", () => {
    const n = normalizeHomeRecoveryInputs({
      sleepHours: Number.NaN,
      hrvMs: 40,
      restingHr: null,
      activeEnergyKcal: 0,
    });
    expect(n.sleepHours).toBeNull();
    const n2 = normalizeHomeRecoveryInputs({
      sleepHours: 7,
      hrvMs: Number.POSITIVE_INFINITY,
      restingHr: null,
      activeEnergyKcal: null,
    });
    expect(n2.hrvMs).toBeNull();
  });
});

describe("computeHomeRecoveryScoreFromInputs (stateless)", () => {
  it("identical inputs -> identical output", () => {
    const inputs = { sleepHours: 7.4, hrvMs: 55, restingHr: null, activeEnergyKcal: 600 };
    expect(computeHomeRecoveryScoreFromInputs(inputs)).toBe(computeHomeRecoveryScoreFromInputs(inputs));
  });

  it("null inputs -> null output", () => {
    expect(
      computeHomeRecoveryScoreFromInputs({ sleepHours: null, hrvMs: 50, restingHr: null, activeEnergyKcal: 200 }),
    ).toBeNull();
    expect(
      computeHomeRecoveryScoreFromInputs({ sleepHours: 7, hrvMs: null, restingHr: null, activeEnergyKcal: 200 }),
    ).toBeNull();
  });

  it("previous-day data cannot affect result (no parameters)", () => {
    const inputs = { sleepHours: 6.8, hrvMs: null, restingHr: 54, activeEnergyKcal: 0 };
    const a = computeHomeRecoveryScoreFromInputs(inputs);
    const b = computeHomeRecoveryScoreFromInputs(inputs);
    expect(a).toBe(b);
  });

  it("plausibility: lower sleep decreases score (with same HRV)", () => {
    const highSleep = computeHomeRecoveryScoreFromInputs({
      sleepHours: 8.0,
      hrvMs: 55,
      restingHr: null,
      activeEnergyKcal: 0,
    });
    const lowSleep = computeHomeRecoveryScoreFromInputs({
      sleepHours: 4.5,
      hrvMs: 55,
      restingHr: null,
      activeEnergyKcal: 0,
    });
    expect(highSleep).not.toBeNull();
    expect(lowSleep).not.toBeNull();
    expect(highSleep as number).toBeGreaterThan(lowSleep as number);
  });

  it("plausibility: higher HRV increases score (with same sleep)", () => {
    const lowHrv = computeHomeRecoveryScoreFromInputs({
      sleepHours: 7.2,
      hrvMs: 30,
      restingHr: null,
      activeEnergyKcal: 0,
    });
    const highHrv = computeHomeRecoveryScoreFromInputs({
      sleepHours: 7.2,
      hrvMs: 70,
      restingHr: null,
      activeEnergyKcal: 0,
    });
    expect(lowHrv).not.toBeNull();
    expect(highHrv).not.toBeNull();
    expect(highHrv as number).toBeGreaterThan(lowHrv as number);
  });

  it("plausibility: higher resting HR decreases score (when HRV missing)", () => {
    const lowRhr = computeHomeRecoveryScoreFromInputs({
      sleepHours: 7.2,
      hrvMs: null,
      restingHr: 48,
      activeEnergyKcal: 0,
    });
    const highRhr = computeHomeRecoveryScoreFromInputs({
      sleepHours: 7.2,
      hrvMs: null,
      restingHr: 75,
      activeEnergyKcal: 0,
    });
    expect(lowRhr).not.toBeNull();
    expect(highRhr).not.toBeNull();
    expect(lowRhr as number).toBeGreaterThan(highRhr as number);
  });
});

