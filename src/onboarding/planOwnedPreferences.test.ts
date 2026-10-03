import { buildOnboardingPreferencesPatch } from "./marathonPreferencesOnboarding";
import { buildIsolatedOnboardingPreferences } from "./onboardingPlanIsolation";
import {
  EMPTY_PLAN_PREFERENCES_STORE,
  assignPlanPreferencesOwner,
  forgetPlanPreferences,
  stashPlanPreferencesBeforeWizard,
  switchPlanPreferences,
} from "./planOwnedPreferences";

const prefsA = {
  onboardingComplete: true,
  personalBestTime: "2:58:10",
  maxHeartRateBpm: 191,
  raceName: "Warschau Marathon",
  raceDate: "27.09.2026",
  raceDistanceLabel: "Marathon",
  raceDistanceKm: 42.195,
  raceGoal: "time" as const,
  raceTargetTime: "2:49:50",
  targetTime: "2:49:50",
};

const wizardB = buildOnboardingPreferencesPatch({
  raceDistanceLabel: "Halbmarathon",
  raceDistanceKm: 21.1,
  raceGoal: "finish",
  raceTargetTime: null,
  raceName: "Testplan Archiv-Flow",
  raceDate: "18.04.2027",
  planStartDate: "03.10.2026",
  weeklyKmRange: "20–40 km",
  userPreferences: [],
});

/** Wizard-Abschluss wie in AppMain: alten Plan merken, Preferences ersetzen, neuen Plan als Besitzer. */
function runWizard(preferences: typeof prefsA, fromPlanId: string, newPlanId: string) {
  const stashed = stashPlanPreferencesBeforeWizard(EMPTY_PLAN_PREFERENCES_STORE, preferences, {
    planId: fromPlanId,
    describesPreferences: true,
  });
  const next = buildIsolatedOnboardingPreferences(wizardB, preferences);
  return { preferences: next, store: assignPlanPreferencesOwner(stashed, newPlanId, next) };
}

describe("plan-eigene Preferences", () => {
  it("Profil mit PR und HFmax → Wizard Plan B → beides bleibt; zurück auf A stimmen Ziel und Distanz von A", () => {
    const afterWizard = runWizard(prefsA, "plan-a", "plan-b");
    expect(afterWizard.preferences).toMatchObject({
      personalBestTime: "2:58:10",
      maxHeartRateBpm: 191,
      raceName: "Testplan Archiv-Flow",
      raceGoal: "finish",
      targetTime: null,
      raceDistanceKm: 21.1,
    });

    const backOnA = switchPlanPreferences({
      ...afterWizard,
      from: { planId: "plan-b", describesPreferences: true },
      to: { planId: "plan-a", describesPreferences: false },
    });
    expect(backOnA.preferences).toMatchObject({
      personalBestTime: "2:58:10",
      maxHeartRateBpm: 191,
      raceName: "Warschau Marathon",
      raceGoal: "time",
      targetTime: "2:49:50",
      raceDistanceKm: 42.195,
    });
    expect(backOnA.store.ownerPlanId).toBe("plan-a");

    const backOnB = switchPlanPreferences({
      ...backOnA,
      from: { planId: "plan-a", describesPreferences: true },
      to: { planId: "plan-b", describesPreferences: false },
    });
    expect(backOnB.preferences).toMatchObject({ raceGoal: "finish", targetTime: null, raceDistanceKm: 21.1, maxHeartRateBpm: 191 });
  });

  it("übernimmt eine nach dem Wizard geänderte Zielzeit des verlassenen Plans", () => {
    const afterWizard = runWizard(prefsA, "plan-a", "plan-b");
    const onA = switchPlanPreferences({
      ...afterWizard,
      from: { planId: "plan-b", describesPreferences: true },
      to: { planId: "plan-a", describesPreferences: false },
    });
    const edited = { ...onA.preferences, targetTime: "2:45:00", maxHeartRateBpm: 188 };
    const onB = switchPlanPreferences({
      preferences: edited,
      store: onA.store,
      from: { planId: "plan-a", describesPreferences: true },
      to: { planId: "plan-b", describesPreferences: false },
    });
    expect(onB.preferences.maxHeartRateBpm).toBe(188);
    const onAAgain = switchPlanPreferences({
      ...onB,
      from: { planId: "plan-b", describesPreferences: true },
      to: { planId: "plan-a", describesPreferences: false },
    });
    expect(onAAgain.preferences.targetTime).toBe("2:45:00");
  });

  it("leert die plan-eigenen Felder, wenn für den Zielplan nichts gemerkt ist — nie die eines anderen Plans", () => {
    const next = switchPlanPreferences({
      preferences: prefsA,
      store: { ownerPlanId: "plan-a", byPlan: {} },
      from: { planId: "plan-a", describesPreferences: true },
      to: { planId: "plan-c", describesPreferences: false },
    });
    expect(next.preferences).toEqual({ onboardingComplete: true, personalBestTime: "2:58:10", maxHeartRateBpm: 191 });
    expect(next.store.byPlan["plan-a"]).toMatchObject({ targetTime: "2:49:50", raceDistanceKm: 42.195 });
  });

  it("Alt-Zustand ohne Besitzer: fremde Preferences werden nicht dem aktiven Plan zugeschrieben", () => {
    // Aktiv ist A, die Preferences sind aber noch die von B (Zustand vor diesem Fix).
    const foreign = buildIsolatedOnboardingPreferences(wizardB, prefsA);
    const toB = switchPlanPreferences({
      preferences: foreign,
      store: EMPTY_PLAN_PREFERENCES_STORE,
      from: { planId: "plan-a", describesPreferences: false },
      to: { planId: "plan-b", describesPreferences: true },
    });
    expect(toB.store.byPlan["plan-a"]).toBeUndefined();
    expect(toB.preferences).toBe(foreign);

    const toA = switchPlanPreferences({
      ...toB,
      from: { planId: "plan-b", describesPreferences: true },
      to: { planId: "plan-a", describesPreferences: false },
    });
    expect(toA.preferences.raceName).toBeUndefined();
    expect(toA.preferences.targetTime).toBeUndefined();
    expect(toA.store.byPlan["plan-b"]).toMatchObject({ raceName: "Testplan Archiv-Flow" });
  });

  it("merkt nichts für einen gelöschten Plan", () => {
    const afterWizard = runWizard(prefsA, "plan-a", "plan-b");
    const next = switchPlanPreferences({
      ...afterWizard,
      from: { planId: "plan-b", describesPreferences: true },
      to: { planId: "plan-a", describesPreferences: false },
      stash: false,
    });
    expect(next.store.byPlan["plan-b"]).toBeUndefined();
    expect(next.preferences.raceName).toBe("Warschau Marathon");
    expect(forgetPlanPreferences(next.store, "plan-a")).toEqual({ ownerPlanId: null, byPlan: {} });
  });
});
