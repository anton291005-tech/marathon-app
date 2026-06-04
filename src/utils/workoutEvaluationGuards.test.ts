import { shouldUseIntervalScoring } from "./workoutEvaluationGuards";

describe("shouldUseIntervalScoring", () => {
  test("easy run without reps → false (full-session pace allowed)", () => {
    expect(
      shouldUseIntervalScoring({
        sessionType: "easy",
        sessionTitle: "Easy Run",
        planDescription: "5:30–5:50/km",
      }),
    ).toBe(false);
  });

  test("interval type → true even without pace label", () => {
    expect(shouldUseIntervalScoring({ sessionType: "interval", sessionTitle: "Work", planDescription: null })).toBe(
      true,
    );
  });

  test("plan text with repetition pattern → true", () => {
    expect(
      shouldUseIntervalScoring({
        sessionType: "easy",
        sessionTitle: "Morning doubles",
        planDescription: "5×2000m @ 4:10/km",
      }),
    ).toBe(true);
  });
});
