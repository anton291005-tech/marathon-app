import { act, renderHook } from "@testing-library/react";
import { resolveActivePlanGoal } from "../planGoal";
import type { PlanWeek } from "../marathonPrediction";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";
import { goalEditKey, goalEditedThisSession, knownPlanCount, profileGoalFitsPlan, rebindGoalEditKey } from "./planGoalBackfill";
import { planGoalFromPreferences, readPlanGoalMeta, withPlanGoalMeta } from "./planGoalMeta";
import type { PlanGoalMetaV2, TrainingPlanV2 } from "./types";
import { usePlanGoalSync } from "./usePlanGoalSync";

jest.mock("../lib/supabase/services/trainingPlanService", () => ({ updateTrainingPlanGoalMeta: jest.fn() }));

const MARATHON_KM = 42.195;
const HALF_KM = 21.0975;

const raceWeek = (km: number): PlanWeek[] =>
  [
    {
      wn: 1,
      label: "Woche 1",
      phase: "Race",
      km,
      s: [{ id: "race", day: "So", date: "20. Dez", dateIso: "2026-12-20", type: "race", title: "Rennen", km }],
    },
  ] as unknown as PlanWeek[];

const v2Plan = (km: number): TrainingPlanV2 =>
  normalizeTrainingPlan({
    version: 2,
    workouts: [
      { id: "a", dateIso: "2026-12-15", sport: "run", sessionType: "easy", title: "Locker", km: 8 },
      { id: "race", dateIso: "2026-12-20", sport: "run", sessionType: "race", title: "Rennen", km },
    ],
  });

describe("profileGoalFitsPlan", () => {
  it("gespeicherte Distanz passt und Zeit plausibel → ja", () => {
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: MARATHON_KM, storedDistanceKm: MARATHON_KM, planCount: 3 })).toBe(true);
  });
  it("gespeicherte Distanz passt nicht → nein, auch wenn die Zeit plausibel wäre (2:50:00 am HM-Plan)", () => {
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: HALF_KM, storedDistanceKm: MARATHON_KM, planCount: 1 })).toBe(false);
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: 10, storedDistanceKm: MARATHON_KM, planCount: 1 })).toBe(false);
  });
  it("gespeicherte Distanz passt, Zeit unplausibel → nein", () => {
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: 10, storedDistanceKm: 10, planCount: 1 })).toBe(false);
  });
  it("Distanz gespeichert, Plan ohne Rennen: nicht zuordenbar → nein, auch bei genau einem Plan", () => {
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: null, storedDistanceKm: MARATHON_KM, planCount: 1 })).toBe(false);
  });
  it("keine Distanz gespeichert: nur bei genau einem Plan und plausibler Zeit", () => {
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: HALF_KM, storedDistanceKm: null, planCount: 1 })).toBe(true);
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: HALF_KM, storedDistanceKm: null, planCount: 2 })).toBe(false);
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: 10, storedDistanceKm: null, planCount: 1 })).toBe(false);
    // Zahl der Pläne noch nicht geladen → nichts schreiben
    expect(profileGoalFitsPlan({ targetTime: "2:50:00", planRaceDistanceKm: MARATHON_KM, storedDistanceKm: null, planCount: null })).toBe(false);
  });
});

/** Die Kette wie in AppMain: resolveActivePlanGoal → usePlanGoalSync. */
function runSync(args: {
  planKm: number;
  planGoal?: PlanGoalMetaV2;
  preferences: { targetTime?: string; raceGoal?: string; raceDistanceKm?: number | null };
  planCount: number;
}) {
  const planId = "plan-active";
  let plan = args.planGoal ? withPlanGoalMeta(v2Plan(args.planKm), args.planGoal) : v2Plan(args.planKm);
  const goal = resolveActivePlanGoal({
    plan: raceWeek(args.planKm),
    planName: "Plan",
    planId,
    ownerPlanId: planId,
    preferences: args.preferences,
    goalSource: { planHasGoal: readPlanGoalMeta(plan) != null, planCount: args.planCount },
  });
  const saved: Array<{ goal: PlanGoalMetaV2; mode: string }> = [];
  jest.useFakeTimers();
  renderHook(() =>
    usePlanGoalSync({
      userId: "u1",
      activePlanId: planId,
      hydrationReady: true,
      plan,
      setPlan: (updater) => {
        plan = updater(plan);
      },
      preferencesGoal: goal.preferencesApply
        ? planGoalFromPreferences({ raceGoal: goal.finishOnly ? "finish" : "time", targetTime: goal.targetTime })
        : null,
      backfillAllowed: goal.backfillAllowed,
      ownerPlanId: planId,
      applyGoalToPreferences: () => undefined,
      claimOwner: () => undefined,
      saveGoal: async (_u, _p, g, mode) => {
        saved.push({ goal: g, mode });
        return true;
      },
      debounceMs: 50,
    }),
  );
  act(() => {
    jest.advanceTimersByTime(500);
  });
  jest.useRealTimers();
  return { goal, saved, planGoal: readPlanGoalMeta(plan) };
}

describe("Zielzeit-Nachtrag (Plan-Sync)", () => {
  const profileMarathon = { targetTime: "2:50:00", raceGoal: "time", raceDistanceKm: MARATHON_KM };

  it("10-km-Plan + Profil Marathon 2:50:00 → kein Nachtrag", () => {
    const r = runSync({ planKm: 10, preferences: profileMarathon, planCount: 2 });
    expect(r.saved).toEqual([]);
    expect(r.planGoal).toBeNull();
  });

  it("10-km-Plan + Profil-Zielzeit 2:50:00 ohne gespeicherte Distanz → kein Nachtrag (auch bei nur einem Plan)", () => {
    const r = runSync({ planKm: 10, preferences: { targetTime: "2:50:00", raceGoal: "time" }, planCount: 1 });
    expect(r.saved).toEqual([]);
    expect(r.planGoal).toBeNull();
  });

  it("HM-Plan + Profil Marathon 2:50:00 → kein Nachtrag, obwohl die Zeit plausibel wäre", () => {
    const r = runSync({ planKm: HALF_KM, preferences: profileMarathon, planCount: 2 });
    expect(r.saved).toEqual([]);
    expect(r.planGoal).toBeNull();
  });

  it("HM-Plan + Profil-Zielzeit 2:50:00 ohne Distanz, mehrere Pläne → kein Nachtrag, keine Anzeige, kein Vorausfüllen", () => {
    const r = runSync({ planKm: HALF_KM, preferences: { targetTime: "2:50:00", raceGoal: "time" }, planCount: 2 });
    expect(r.saved).toEqual([]);
    expect(r.planGoal).toBeNull();
    expect(r.goal.displayTargetTime).toBe("");
    expect(r.goal.targetSeconds).toBeNull();
    expect(r.goal.inputTargetTime).toBe("");
  });

  it("Marathonplan ohne meta.goal + Profil Marathon 2:50:00 → Nachtrag", () => {
    const r = runSync({ planKm: MARATHON_KM, preferences: profileMarathon, planCount: 2 });
    expect(r.saved).toEqual([{ goal: { raceGoal: "time", targetTime: "2:50:00" }, mode: "backfill" }]);
    expect(r.planGoal).toEqual({ raceGoal: "time", targetTime: "2:50:00" });
    expect(r.goal.inputTargetTime).toBe("2:50:00");
  });

  it("Marathonplan ohne meta.goal, keine Distanz gespeichert, genau ein Plan → Nachtrag", () => {
    const r = runSync({ planKm: MARATHON_KM, preferences: { targetTime: "2:50:00", raceGoal: "time" }, planCount: 1 });
    expect(r.saved).toEqual([{ goal: { raceGoal: "time", targetTime: "2:50:00" }, mode: "backfill" }]);
  });

  it("Plan mit vorhandenem meta.goal → unverändert", () => {
    const r = runSync({
      planKm: MARATHON_KM,
      planGoal: { raceGoal: "time", targetTime: "3:10:00" },
      preferences: profileMarathon,
      planCount: 1,
    });
    expect(r.saved).toEqual([]);
    expect(r.planGoal).toEqual({ raceGoal: "time", targetTime: "3:10:00" });
  });
});

describe("Eingabefeld „Zielzeit“", () => {
  const base = { plan: raceWeek(10), planName: "10 km", planId: "t", ownerPlanId: "t" };

  it("unplausibler gespeicherter Wert wird nicht vorausgefüllt, auch nicht aus meta.goal", () => {
    const goal = resolveActivePlanGoal({
      ...base,
      preferences: { targetTime: "2:50:00", raceGoal: "time", raceDistanceKm: 10 },
      goalSource: { planHasGoal: true, planCount: 1 },
    });
    expect(goal.inputTargetTime).toBe("");
    expect(goal.displayTargetTime).toBe("");
  });

  it("während der Eingabe bleibt der Rohwert stehen (Tippen wird nicht unterbrochen)", () => {
    const goal = resolveActivePlanGoal({
      ...base,
      preferences: { targetTime: "2:50:00", raceGoal: "time" },
      goalSource: { planHasGoal: false, planCount: 3, editedThisSession: true },
    });
    expect(goal.inputTargetTime).toBe("2:50:00");
    // angezeigt und gerechnet wird trotzdem nur eine plausible Zeit
    expect(goal.displayTargetTime).toBe("");
  });

  it("plausibler Wert des Plans wird vorausgefüllt", () => {
    const goal = resolveActivePlanGoal({
      ...base,
      preferences: { targetTime: "0:48:00", raceGoal: "time", raceDistanceKm: 10 },
      goalSource: { planHasGoal: true, planCount: 2 },
    });
    expect(goal.inputTargetTime).toBe("0:48:00");
  });

  it("ohne goalSource (alte Aufrufer) bleibt das Verhalten wie bisher", () => {
    const goal = resolveActivePlanGoal({ ...base, preferences: { targetTime: "0:48:00", raceGoal: "time" } });
    expect(goal.goalTrusted).toBe(true);
    expect(goal.backfillAllowed).toBe(true);
    expect(goal.displayTargetTime).toBe("0:48:00");
  });
});

describe("knownPlanCount (Zahl aller Pläne nur, wenn sie sicher ist)", () => {
  it("Zählung fehlgeschlagen oder noch nicht da → unbekannt", () => {
    expect(knownPlanCount(null, 1, 0)).toBeNull();
    expect(knownPlanCount(undefined, 1, 0)).toBeNull();
  });
  it("Archiv-Abfrage fehlgeschlagen (Liste leer, gezählt 2) → unbekannt, kein „genau ein Plan“", () => {
    expect(knownPlanCount(2, 1, 0)).toBeNull();
  });
  it("Archiv-Liste vor der Plan-Liste da (0 + 1, gezählt 2) → unbekannt", () => {
    expect(knownPlanCount(2, 0, 1)).toBeNull();
  });
  it("Zählung und Listen decken sich → Zahl", () => {
    expect(knownPlanCount(1, 1, 0)).toBe(1);
    expect(knownPlanCount(3, 2, 1)).toBe(3);
  });
  it("unbekannte Zahl: fremde Zielzeit ohne Distanz wird nicht nachgetragen", () => {
    const goal = resolveActivePlanGoal({
      plan: raceWeek(HALF_KM),
      planName: "HM",
      planId: "p",
      ownerPlanId: null,
      preferences: { targetTime: "2:50:00", raceGoal: "time" },
      goalSource: { planHasGoal: false, planCount: knownPlanCount(2, 1, 0) },
    });
    expect(goal.backfillAllowed).toBe(false);
    expect(goal.displayTargetTime).toBe("");
  });
});

describe("Eingabe-Markierung ohne Plan-ID (Start, offline)", () => {
  it("Eingabe ohne bekannte Plan-ID zählt als Eingabe und wird an die erste bekannte Plan-ID gebunden", () => {
    const key = goalEditKey(null);
    expect(goalEditedThisSession(key, null)).toBe(true);
    const bound = rebindGoalEditKey(key, "plan-1");
    expect(bound).toBe("plan-1");
    expect(goalEditedThisSession(bound, "plan-1")).toBe(true);
  });
  it("Sentinel, dann Plan B: nach dem Binden an Plan A gilt die Eingabe nicht für Plan B", () => {
    const bound = rebindGoalEditKey(goalEditKey(null), "a");
    expect(rebindGoalEditKey(bound, "b")).toBe("a");
    expect(goalEditedThisSession(bound, "b")).toBe(false);
    // und ein ungebundener Sentinel zählt nie für einen Plan mit ID
    expect(goalEditedThisSession(goalEditKey(null), "b")).toBe(false);
    const goal = resolveActivePlanGoal({
      plan: raceWeek(HALF_KM),
      planName: "HM",
      planId: "b",
      ownerPlanId: null,
      preferences: { targetTime: "2:50:00", raceGoal: "time" },
      goalSource: { planHasGoal: false, planCount: 2, editedThisSession: goalEditedThisSession(bound, "b") },
    });
    expect(goal.displayTargetTime).toBe("");
    expect(goal.inputTargetTime).toBe("");
  });
  it("ohne Plan-ID, aber mit gespeichertem Besitzer (wiederkehrender Nutzer, offline): Tippen bleibt stehen", () => {
    const goal = resolveActivePlanGoal({
      plan: raceWeek(10),
      planName: "10 km",
      planId: null,
      ownerPlanId: "plan-x",
      preferences: { targetTime: "3", raceGoal: "time" },
      goalSource: { planHasGoal: false, planCount: null, editedThisSession: true },
    });
    expect(goal.inputTargetTime).toBe("3");
    expect(goal.displayTargetTime).toBe("");
  });
  it("Eingabe an Plan A zählt nicht für Plan B; ohne Eingabe nie", () => {
    expect(goalEditedThisSession(goalEditKey("a"), "a")).toBe(true);
    expect(goalEditedThisSession(goalEditKey("a"), "b")).toBe(false);
    expect(goalEditedThisSession(null, null)).toBe(false);
  });
  it("Feld zeigt beim Tippen den Rohwert, auch ohne Plan-ID und bei unplausibler vollständiger Zeit", () => {
    const goal = resolveActivePlanGoal({
      plan: raceWeek(10),
      planName: "10 km",
      planId: null,
      ownerPlanId: null,
      preferences: { targetTime: "2:50:00", raceGoal: "time" },
      goalSource: { planHasGoal: true, planCount: null, editedThisSession: goalEditedThisSession(goalEditKey(null), null) },
    });
    expect(goal.inputTargetTime).toBe("2:50:00");
  });
});

describe("Finish-Ziel aus fremden Preferences", () => {
  it("nicht zuordenbares „Nur finishen“ erscheint nicht als Zielzeile", () => {
    const goal = resolveActivePlanGoal({
      plan: raceWeek(10),
      planName: "10 km",
      planId: "t",
      ownerPlanId: "t",
      preferences: { targetTime: "", raceGoal: "finish" },
      goalSource: { planHasGoal: false, planCount: 2 },
    });
    expect(goal.targetTimeLabel).toBeUndefined();
    expect(goal.backfillAllowed).toBe(false);
  });
});
