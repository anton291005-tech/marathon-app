import { recapRecord } from "../components/prepRecap/recapTestFixtures";
import { isPrepRecapOfPlan, pickPrepRecapForDisplay } from "./prepRecapRecord";

describe("pickPrepRecapForDisplay", () => {
  it("nimmt Remote, wenn es keinen Cache gibt, und den Cache ohne Remote", () => {
    const remote = recapRecord({ id: "remote" });
    const cached = recapRecord({ id: "cached" });
    expect(pickPrepRecapForDisplay(null, remote)).toBe(remote);
    expect(pickPrepRecapForDisplay(cached, null)).toBe(cached);
    expect(pickPrepRecapForDisplay(null, null)).toBeNull();
  });

  it("Remote gewinnt im Normalfall (z. B. auf anderem Gerät bestätigt)", () => {
    const cached = recapRecord({ finishTimeConfirmed: false });
    const remote = recapRecord({ finishTimeSeconds: 11500, finishTimeSource: "manual", finishTimeConfirmed: true });
    expect(pickPrepRecapForDisplay(cached, remote)).toBe(remote);
  });

  it("eine offline bestätigte Zeit bleibt gegen einen unbestätigten Remote-Stand", () => {
    const cached = recapRecord({ finishTimeSeconds: 11568, finishTimeSource: "manual", finishTimeConfirmed: true });
    const remote = recapRecord({ finishTimeSeconds: 11637, finishTimeSource: "health", finishTimeConfirmed: false });
    expect(pickPrepRecapForDisplay(cached, remote)).toEqual({
      ...remote,
      finishTimeSeconds: 11568,
      finishTimeSource: "manual",
      finishTimeConfirmed: true,
    });
  });

  it("ignoriert einen Cache-Eintrag eines anderen Renntags", () => {
    const cached = recapRecord({ raceDate: "2026-08-30", finishTimeConfirmed: true });
    const remote = recapRecord({ finishTimeConfirmed: false });
    expect(pickPrepRecapForDisplay(cached, remote)).toBe(remote);
  });
});

describe("isPrepRecapOfPlan", () => {
  it("lässt nur den Rückblick des aktiven Plans durch", () => {
    expect(isPrepRecapOfPlan(recapRecord({ planId: "plan-warschau" }), "plan-warschau")).toBe(true);
    expect(isPrepRecapOfPlan(recapRecord({ planId: "plan-warschau" }), "plan-neu")).toBe(false);
  });

  it("entscheidet ohne Verknüpfung oder ohne bekannten aktiven Plan allein über das Renndatum", () => {
    expect(isPrepRecapOfPlan(recapRecord({ planId: null }), "plan-neu")).toBe(true);
    expect(isPrepRecapOfPlan(recapRecord({ planId: "plan-warschau" }), null)).toBe(true);
    expect(isPrepRecapOfPlan(null, "plan-neu")).toBe(false);
  });
});
