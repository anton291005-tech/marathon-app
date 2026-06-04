import {
  buildOnboardingPreferencesPatch,
  formatOnboardingDateGerman,
  getNextMonday,
  needsOnboarding,
  parseOnboardingRaceDate,
  parseRaceDistanceKm,
  resolvePlanStartDate,
  usesMarathonTimeFormat,
} from "./marathonPreferencesOnboarding";

describe("parseRaceDistanceKm", () => {
  it("parses km with comma decimal", () => {
    expect(parseRaceDistanceKm("42,2 km")).toBe(42.2);
  });

  it("parses miles", () => {
    expect(parseRaceDistanceKm("100 Meilen")).toBeCloseTo(160.9, 0);
  });

  it("returns null for race names without distance", () => {
    expect(parseRaceDistanceKm("Leadville 100")).toBeNull();
  });
});

describe("usesMarathonTimeFormat", () => {
  it("uses HH:MM:SS for marathon distance", () => {
    expect(usesMarathonTimeFormat(42.2, "Marathon (42,2 km)")).toBe(true);
  });

  it("uses HH:MM for shorter distances", () => {
    expect(usesMarathonTimeFormat(10, "10 km")).toBe(false);
  });
});

describe("needsOnboarding", () => {
  it("skips when onboardingComplete", () => {
    expect(
      needsOnboarding({ prefs: { onboardingComplete: true }, hasUserTrainingPlan: false }),
    ).toBe(false);
  });

  it("skips when user has a persisted training plan", () => {
    expect(needsOnboarding({ prefs: {}, hasUserTrainingPlan: true })).toBe(false);
  });

  it("does not skip legacy users with targetTime alone", () => {
    expect(
      needsOnboarding({ prefs: { targetTime: "2:49:50" }, hasUserTrainingPlan: false }),
    ).toBe(true);
  });

  it("shows for empty prefs without plan", () => {
    expect(needsOnboarding({ prefs: {}, hasUserTrainingPlan: false })).toBe(true);
  });

  it("honors reset_onboarding flag", () => {
    expect(
      needsOnboarding({
        prefs: { onboardingComplete: true },
        hasUserTrainingPlan: true,
        resetOnboarding: true,
      }),
    ).toBe(true);
  });
});

describe("parseOnboardingRaceDate", () => {
  it("parses TT.MM.JJJJ", () => {
    const d = parseOnboardingRaceDate("27.09.2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(27);
  });

  it("rejects invalid dates", () => {
    expect(parseOnboardingRaceDate("31.02.2026")).toBeNull();
    expect(parseOnboardingRaceDate("27-09-2026")).toBeNull();
  });
});

describe("resolvePlanStartDate", () => {
  it("uses today for today choice", () => {
    const now = new Date(2026, 4, 15, 12, 0, 0);
    const r = resolvePlanStartDate("today", "", now);
    expect(r.planStartDate).toBe(formatOnboardingDateGerman(now));
  });

  it("uses next Monday when today is Monday", () => {
    const monday = new Date(2026, 4, 18, 10, 0, 0);
    const next = getNextMonday(monday);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(25);
  });
});

describe("buildOnboardingPreferencesPatch", () => {
  it("sets targetTime with seconds for marathon goal time", () => {
    const patch = buildOnboardingPreferencesPatch({
      raceDistanceLabel: "Marathon (42,2 km)",
      raceDistanceKm: 42.2,
      raceGoal: "time",
      raceTargetTime: "3:30:00",
      raceName: null,
      raceDate: "27.09.2026",
      planStartDate: "15.05.2026",
      weeklyKmRange: "40–60 km",
      userPreferences: [],
    });
    expect(patch.onboardingComplete).toBe(true);
    expect(patch.targetTime).toBe("3:30:00");
    expect(patch.raceTargetTime).toBe("3:30:00");
  });

  it("clears targetTime when race goal is finish", () => {
    const patch = buildOnboardingPreferencesPatch({
      raceDistanceLabel: "Marathon (42,2 km)",
      raceDistanceKm: 42.2,
      raceGoal: "finish",
      raceTargetTime: "2:49:50",
      raceName: null,
      raceDate: "27.09.2026",
      planStartDate: "15.05.2026",
      weeklyKmRange: "40–60 km",
      userPreferences: [],
    });
    expect(patch.targetTime).toBeNull();
    expect(patch.planStartDate).toBe("15.05.2026");
    expect(patch.raceTargetTime).toBeNull();
    expect(patch.raceGoal).toBe("finish");
  });

  it("persists non-empty userPreferences", () => {
    const patch = buildOnboardingPreferencesPatch({
      raceDistanceLabel: "10 km",
      raceDistanceKm: 10,
      raceGoal: "finish",
      raceTargetTime: null,
      raceName: null,
      raceDate: null,
      planStartDate: null,
      weeklyKmRange: "20–40 km",
      userPreferences: [" Kein Training am Dienstag ", "", "Long Run sonntags"],
    });
    expect(patch.userPreferences).toEqual(["Kein Training am Dienstag", "Long Run sonntags"]);
  });
});
