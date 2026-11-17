import { act, renderHook } from "@testing-library/react";
import { normalizeTrainingPlan } from "./normalizeTrainingPlan";
import {
  applyPlanGoalToPreferences,
  planGoalFromPreferences,
  readPlanGoalMeta,
  withPlanGoalMeta,
} from "./planGoalMeta";
import type { PlanGoalMetaV2, TrainingPlanV2 } from "./types";
import { usePlanGoalSync } from "./usePlanGoalSync";

jest.mock("../lib/supabase/services/trainingPlanService", () => ({ updateTrainingPlanGoalMeta: jest.fn() }));

const basePlan = (): TrainingPlanV2 =>
  normalizeTrainingPlan({
    version: 2,
    workouts: [
      { id: "a", dateIso: "2026-11-17", sport: "run", sessionType: "easy", title: "Locker", km: 8 },
      { id: "b", dateIso: "2026-11-22", sport: "run", sessionType: "race", title: "Halbmarathon", km: 21.1 },
    ],
  });

describe("planGoalMeta", () => {
  it("übersteht normalizeTrainingPlan (Speichern/Laden in Supabase und localStorage)", () => {
    const plan = withPlanGoalMeta(basePlan(), { raceGoal: "time", targetTime: "1:45:00" });
    const roundTrip = normalizeTrainingPlan(JSON.parse(JSON.stringify(plan)));
    expect(readPlanGoalMeta(roundTrip)).toEqual({ raceGoal: "time", targetTime: "1:45:00" });
  });

  it("Finish-Ziel hat nie eine Zielzeit; kaputte Werte fallen weg", () => {
    expect(readPlanGoalMeta(normalizeTrainingPlan({ ...basePlan(), meta: { goal: { raceGoal: "finish", targetTime: "3:00:00" } } }))).toEqual({
      raceGoal: "finish",
      targetTime: null,
    });
    expect(readPlanGoalMeta(normalizeTrainingPlan({ ...basePlan(), meta: { goal: { raceGoal: "sub3" } } }))).toBeNull();
  });

  it("Altplan ohne meta.goal: kein Ziel am Plan (Rückfall auf Preferences/Profil)", () => {
    expect(readPlanGoalMeta(basePlan())).toBeNull();
  });

  it("Ziel aus den Preferences: Zielzeit vor Finish, leer = keine Zielzeit", () => {
    expect(planGoalFromPreferences({ raceGoal: "finish", targetTime: "" })).toEqual({ raceGoal: "finish", targetTime: null });
    expect(planGoalFromPreferences({ raceGoal: "finish", targetTime: "4:00:00" })).toEqual({ raceGoal: "time", targetTime: "4:00:00" });
    expect(planGoalFromPreferences({})).toEqual({ raceGoal: "time", targetTime: null });
  });

  it("Plan-Ziel überschreibt eine fremde Profil-Zielzeit in den Preferences", () => {
    const prefs = { targetTime: "2:50:00", raceGoal: "time", maxHeartRateBpm: 190 };
    expect(applyPlanGoalToPreferences(prefs, { raceGoal: "time", targetTime: "1:45:00" })).toEqual({
      targetTime: "1:45:00",
      raceGoal: "time",
      maxHeartRateBpm: 190,
    });
    expect(applyPlanGoalToPreferences(prefs, { raceGoal: "finish", targetTime: null })).toMatchObject({
      targetTime: "",
      raceGoal: "finish",
    });
    const same = { targetTime: "1:45:00", raceGoal: "time" };
    expect(applyPlanGoalToPreferences(same, { raceGoal: "time", targetTime: "1:45:00" })).toBe(same);
  });

  it("withPlanGoalMeta lässt andere Meta-Felder stehen und gibt bei Gleichheit dasselbe Objekt zurück", () => {
    const plan = { ...basePlan(), meta: { volumeNote: { code: "peak-not-reached" as const, reason: "growth" as const, targetPeakKm: 50, reachedPeakKm: 45 } } };
    const next = withPlanGoalMeta(plan, { raceGoal: "time", targetTime: "3:30:00" });
    expect(next.meta?.volumeNote).toEqual(plan.meta.volumeNote);
    expect(withPlanGoalMeta(next, { raceGoal: "time", targetTime: "3:30:00" })).toBe(next);
  });
});

describe("usePlanGoalSync", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  type Props = { plan: TrainingPlanV2; preferencesGoal: PlanGoalMetaV2 | null; ownerPlanId: string | null; activePlanId: string };

  function setup(initial: Props) {
    const applied: PlanGoalMetaV2[] = [];
    const claimed: string[] = [];
    const saved: Array<{ planId: string; goal: PlanGoalMetaV2; mode: string }> = [];
    let plan = initial.plan;
    const view = renderHook((p: Props) =>
      usePlanGoalSync({
        userId: "u1",
        activePlanId: p.activePlanId,
        hydrationReady: true,
        plan: p.plan,
        setPlan: (updater) => {
          plan = updater(plan);
        },
        preferencesGoal: p.preferencesGoal,
        ownerPlanId: p.ownerPlanId,
        applyGoalToPreferences: (g) => applied.push(g),
        claimOwner: (id) => claimed.push(id),
        saveGoal: async (_u, planId, goal, mode) => {
          saved.push({ planId, goal, mode });
          return true;
        },
        debounceMs: 100,
      }),
      { initialProps: initial },
    );
    const flush = () =>
      act(() => {
        jest.advanceTimersByTime(500);
      });
    return { view, applied, claimed, saved, getPlan: () => plan, flush };
  }

  it("frisches Gerät (Besitzer unbekannt): Ziel des Plans gilt, nicht die Profil-Zielzeit", () => {
    const plan = withPlanGoalMeta(basePlan(), { raceGoal: "time", targetTime: "1:45:00" });
    const { applied, claimed, saved, flush } = setup({
      plan,
      // Profil-Zielzeit eines anderen Plans, die Heuristik hält die Preferences für passend.
      preferencesGoal: { raceGoal: "time", targetTime: "2:50:00" },
      ownerPlanId: null,
      activePlanId: "plan-hm",
    });
    flush();
    expect(applied).toEqual([{ raceGoal: "time", targetTime: "1:45:00" }]);
    expect(claimed).toEqual(["plan-hm"]);
    expect(saved).toEqual([]);
  });

  it("Preferences gehören einem anderen Plan: weder Ziel noch Besitzer übernehmen", () => {
    const plan = withPlanGoalMeta(basePlan(), { raceGoal: "time", targetTime: "1:45:00" });
    const { applied, claimed, saved, flush } = setup({ plan, preferencesGoal: null, ownerPlanId: "plan-other", activePlanId: "plan-hm" });
    flush();
    expect(applied).toEqual([]);
    expect(claimed).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("veraltete lokale Zielzeit beim Öffnen überschreibt meta.goal nicht", () => {
    const plan = withPlanGoalMeta(basePlan(), { raceGoal: "time", targetTime: "3:10:00" });
    const { view, saved, getPlan, flush } = setup({
      plan,
      preferencesGoal: { raceGoal: "time", targetTime: "3:30:00" },
      ownerPlanId: "p",
      activePlanId: "p",
    });
    flush();
    // auch ein weiteres Rendern ohne Eingabe schreibt nichts
    view.rerender({ plan, preferencesGoal: { raceGoal: "time", targetTime: "3:30:00" }, ownerPlanId: "p", activePlanId: "p" });
    flush();
    expect(saved).toEqual([]);
    expect(readPlanGoalMeta(getPlan())).toEqual({ raceGoal: "time", targetTime: "3:10:00" });
  });

  it("Altplan ohne meta.goal: gehören die Preferences dazu, wird das Ziel nachgetragen", () => {
    const { saved, getPlan, flush } = setup({
      plan: basePlan(),
      preferencesGoal: { raceGoal: "time", targetTime: "3:15:00" },
      ownerPlanId: "plan-m",
      activePlanId: "plan-m",
    });
    flush();
    expect(saved).toEqual([{ planId: "plan-m", goal: { raceGoal: "time", targetTime: "3:15:00" }, mode: "backfill" }]);
    expect(readPlanGoalMeta(getPlan())).toEqual({ raceGoal: "time", targetTime: "3:15:00" });
  });

  it("echte Eingabe in den Einstellungen: verzögert gespeichert, nur der letzte Stand", () => {
    const plan = withPlanGoalMeta(basePlan(), { raceGoal: "time", targetTime: "3:15:00" });
    const { view, saved, flush } = setup({ plan, preferencesGoal: { raceGoal: "time", targetTime: "3:15:00" }, ownerPlanId: "p", activePlanId: "p" });
    act(() => view.result.current.noteGoalInput());
    view.rerender({ plan, preferencesGoal: { raceGoal: "time", targetTime: "3:1" }, ownerPlanId: "p", activePlanId: "p" });
    view.rerender({ plan, preferencesGoal: { raceGoal: "time", targetTime: "3:10:00" }, ownerPlanId: "p", activePlanId: "p" });
    flush();
    expect(saved).toEqual([{ planId: "p", goal: { raceGoal: "time", targetTime: "3:10:00" }, mode: "edit" }]);
  });

  it("Preferences gehören nicht zum Plan: nichts schreiben", () => {
    const { saved, flush } = setup({ plan: basePlan(), preferencesGoal: null, ownerPlanId: "other", activePlanId: "p" });
    flush();
    expect(saved).toEqual([]);
  });

  it("Planwechsel vor Ablauf der Verzögerung: nichts in den neuen Plan schreiben", () => {
    const plan = basePlan();
    const { view, saved, flush } = setup({ plan, preferencesGoal: { raceGoal: "time", targetTime: "3:15:00" }, ownerPlanId: "p1", activePlanId: "p1" });
    view.rerender({ plan, preferencesGoal: null, ownerPlanId: "p2", activePlanId: "p2" });
    flush();
    expect(saved).toEqual([]);
  });
});
