import {
  buildIsolatedOnboardingPreferences,
  detachSessionLogsFromPlan,
} from "./onboardingPlanIsolation";
import type { TrainingPlanV2 } from "../planV2/types";

const samplePlan: TrainingPlanV2 = {
  version: 2,
  workouts: [
    {
      id: "coach-gen-2026-05-01-easy",
      dateIso: "2026-05-01T10:00:00.000Z",
      sport: "run",
      sessionType: "easy",
      title: "Easy Run",
      km: 8,
    },
  ],
  weeks: [],
};

describe("buildIsolatedOnboardingPreferences", () => {
  it("does not carry a legacy targetTime for finish goal", () => {
    const isolated = buildIsolatedOnboardingPreferences({
      raceDistanceLabel: "Marathon",
      raceDistanceKm: 42.2,
      raceGoal: "finish",
      raceTargetTime: null,
      raceName: null,
      raceDate: "27.09.2026",
      planStartDate: "1.06.2026",
      weeklyKmRange: "40–60 km",
      onboardingComplete: true,
      targetTime: null,
    });
    expect(isolated.planStartDate).toBe("1.06.2026");
    expect(isolated.targetTime).toBeNull();
    expect(isolated.raceGoal).toBe("finish");
  });

  it("keeps targetTime for time goal", () => {
    const isolated = buildIsolatedOnboardingPreferences({
      raceDistanceLabel: "Marathon",
      raceDistanceKm: 42.2,
      raceGoal: "time",
      raceTargetTime: "3:30:00",
      raceName: null,
      raceDate: "27.09.2026",
      planStartDate: null,
      weeklyKmRange: "40–60 km",
      onboardingComplete: true,
      targetTime: "3:30:00",
    });
    expect(isolated.targetTime).toBe("3:30:00");
  });

  it("keeps everything the wizard does not ask for (PR, HFmax, unknown extras)", () => {
    const current = {
      personalBestTime: "2:58:10",
      maxHeartRateBpm: 191,
      notificationsEnabled: true,
      targetTime: "2:49:50",
      raceName: "Warschau Marathon",
      raceDate: "27.09.2026",
      raceDistanceKm: 42.195,
      userPreferences: ["kein Montag"],
    } as Parameters<typeof buildIsolatedOnboardingPreferences>[1];
    const isolated = buildIsolatedOnboardingPreferences(
      {
        raceDistanceLabel: "Halbmarathon",
        raceDistanceKm: 21.1,
        raceGoal: "finish",
        raceTargetTime: null,
        raceName: "Testplan Archiv-Flow",
        raceDate: "18.04.2027",
        planStartDate: null,
        weeklyKmRange: "20–40 km",
        onboardingComplete: true,
        targetTime: null,
      },
      current,
    );
    expect(isolated).toMatchObject({ personalBestTime: "2:58:10", maxHeartRateBpm: 191, notificationsEnabled: true });
    // plan-eigene Felder kommen nur aus dem Wizard — nichts vom alten Plan bleibt hängen
    expect(isolated).toMatchObject({ raceName: "Testplan Archiv-Flow", raceDistanceKm: 21.1, targetTime: null });
    expect("userPreferences" in isolated).toBe(false);
  });
});

describe("detachSessionLogsFromPlan", () => {
  it("drops logs for session ids not in the new plan", () => {
    const logs = detachSessionLogsFromPlan(
      {
        "w25-so": { feeling: 4, actualKm: "42", notes: "", done: true, skipped: false },
        "coach-gen-2026-05-01-easy": {
          feeling: 3,
          actualKm: "8",
          notes: "",
          done: true,
          skipped: false,
        },
      },
      samplePlan,
    );
    expect(Object.keys(logs)).toEqual(["coach-gen-2026-05-01-easy"]);
  });
});
