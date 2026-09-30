import { calculateLongestPlanAwareStreak } from "./streak";

describe("calculateLongestPlanAwareStreak", () => {
  it("zählt erledigte Trainingstage, Ruhetage unterbrechen nicht", () => {
    expect(
      calculateLongestPlanAwareStreak(["completed", "no_training_planned", "completed", "completed"]),
    ).toBe(3);
  });

  it("ein offener Trainingstag beendet die Serie, die längste zählt", () => {
    expect(
      calculateLongestPlanAwareStreak([
        "completed",
        "completed",
        "completed",
        "incomplete_planned",
        "completed",
        "completed",
      ]),
    ).toBe(3);
  });

  it("ist 0 ohne erledigte Tage", () => {
    expect(calculateLongestPlanAwareStreak([])).toBe(0);
    expect(calculateLongestPlanAwareStreak(["incomplete_planned", "no_training_planned"])).toBe(0);
  });
});
