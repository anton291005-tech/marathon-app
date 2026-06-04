import { rebuildPlanFromWorkouts } from "../core/deriveWeeksFromWorkouts";
import { isEmbeddedLegacyTrainingPlan, isUserTrainingPlan } from "./isUserTrainingPlan";

describe("isEmbeddedLegacyTrainingPlan", () => {
  it("detects embedded demo plan session ids", () => {
    const plan = rebuildPlanFromWorkouts({
      workouts: [
        {
          id: "w01-mo",
          dateIso: "2026-04-06T10:00:00.000Z",
          sport: "rest",
          sessionType: "rest",
          title: "Ruhetag",
          km: 0,
        },
      ],
    });
    expect(isEmbeddedLegacyTrainingPlan(plan)).toBe(true);
  });

  it("returns false for coach-generated plans", () => {
    const plan = rebuildPlanFromWorkouts({
      workouts: [
        {
          id: "coach-gen-2026-05-01-easy",
          dateIso: "2026-05-01T10:00:00.000Z",
          sport: "run",
          sessionType: "easy",
          title: "Easy",
          km: 8,
        },
      ],
    });
    expect(isEmbeddedLegacyTrainingPlan(plan)).toBe(false);
  });
});

describe("isUserTrainingPlan", () => {
  it("rejects embedded legacy plans even with onboarding prefs", () => {
    const plan = rebuildPlanFromWorkouts({
      workouts: [
        {
          id: "w25-so",
          dateIso: "2026-09-27T10:00:00.000Z",
          sport: "run",
          sessionType: "race",
          title: "Marathon",
          km: 42.2,
        },
      ],
    });
    expect(isUserTrainingPlan(plan, { onboardingComplete: true })).toBe(false);
  });

  it("accepts coach-generated plans", () => {
    const plan = rebuildPlanFromWorkouts({
      workouts: [
        {
          id: "coach-gen-2026-09-27-race",
          dateIso: "2026-09-27T10:00:00.000Z",
          sport: "run",
          sessionType: "race",
          title: "Marathon",
          km: 42.2,
        },
      ],
    });
    expect(isUserTrainingPlan(plan, {})).toBe(true);
  });
});
