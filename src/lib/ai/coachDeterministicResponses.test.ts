import { tryDeterministicCoachResponse, extractRelativeDaysUntilRaceGerman, normalizeCoachText } from "./coachDeterministicResponses";
import type { AiContext } from "./types";
import { getRecoveryDomainState } from "../../recovery/recoveryDomainState";
import type { PlanWeek } from "../../marathonPrediction";
import {
  recoveryHealthVersionFingerprint,
  recoverySnapshotVersionHash,
  recoveryWorkoutsVersionFingerprint,
} from "../../recovery/recoveryStorage";
import { toAiPlanWeeks } from "./planToAi";
import { buildRecoverySummaryFromDomain } from "./recoverySummary";
import { generateMarathonPlanV2ToRace } from "./coachPlanMutations";
import { validateTrainingPlanV2Integrity } from "../../ai/validation/validateTrainingPlanV2Integrity";

function makePlan(datesessions: Array<{ date: string; day: string; id: string; type: string; title: string; km: number }>) {
  return [
    {
      wn: 1,
      phase: "TEST",
      label: "Test",
      dates: "Mix",
      km: 99,
      s: datesessions.map((s, i) => ({
        ...s,
        desc: "",
        pace: null,
      })),
    },
  ] satisfies PlanWeek[];
}

function ctxFor(planRaw: PlanWeek[], todayIso: string, overrides?: Partial<AiContext>): AiContext {
  const logs = {};
  const pf = JSON.stringify([]);
  const wf = recoveryWorkoutsVersionFingerprint(logs);
  const hf = recoveryHealthVersionFingerprint([]);
  const v = recoverySnapshotVersionHash({ workoutsFingerprint: wf, healthFingerprint: hf, planFingerprint: pf });
  const recoveryDomain = getRecoveryDomainState({
    now: new Date(todayIso),
    plan: planRaw,
    logs,
    recoveryDailyRows: [],
    loadStressIdx: 2,
    todayCalendarYmd: todayIso.slice(0, 10),
    homeScoreByDay: {},
    snapshotVersion: v,
    recoveryInputVersion: v,
    workoutsFingerprint: wf,
    healthFingerprint: hf,
    planFingerprint: pf,
    bootPhaseComplete: true,
  });
  return {
    todayIso,
    raceDateIso: new Date("2026-09-27T12:00:00").toISOString(),
    maxHeartRateBpm: 185,
    healthRuns: [],
    goals: { targetTime: "3:05:00" },
    logs,
    plan: toAiPlanWeeks(planRaw),
    next14Days: [],
    availableScreens: [],
    recoveryDomain,
    recoverySummary: buildRecoverySummaryFromDomain(recoveryDomain),
    ...(overrides || {}),
  };
}

describe("tryDeterministicCoachResponse — 10 user scenarios", () => {
  test("1 injury: ankle + 2 weeks no running → actionable patches", () => {
    const plan = makePlan([
      { id: "w1-di", date: "5. Mai", day: "Di", type: "easy", title: "Easy", km: 8 },
      { id: "w1-mi", date: "6. Mai", day: "Mi", type: "interval", title: "IV", km: 10 },
      { id: "w3-so", date: "21. Mai", day: "So", type: "long", title: "Long", km: 20 },
    ]);
    const ctx = ctxFor(plan, new Date("2026-05-05T08:00:00").toISOString());
    const res = tryDeterministicCoachResponse("Ich habe mir den Knoechel verdreht und kann 2 Wochen nicht laufen.", ctx);
    expect(res?.action?.type).toBe("adapt_plan_injury_no_run");
    expect(res?.action?.preview?.items?.length).toBeGreaterThan(0);
  });

  test("4 nutrition before long run", () => {
    const ctx = ctxFor(makePlan([]), new Date("2026-05-03T08:00:00").toISOString());
    const res = tryDeterministicCoachResponse("Was soll ich 2 Stunden vor einem langen Lauf essen?", ctx);
    expect(res?.action).toBeUndefined();
    expect(res?.message?.toLowerCase()).toMatch(/kohlenhydrat|flussi|essen/);
  });

  test("5 next week +15 % volume action", () => {
    const plan = makePlan([
      { id: "n1", date: "11. Mai", day: "So", type: "easy", title: "E", km: 10 },
      { id: "n2", date: "12. Mai", day: "Mo", type: "rest", title: "R", km: 0 },
    ]);
    const ctx = ctxFor(plan, new Date("2026-05-05T08:00:00").toISOString());
    const res = tryDeterministicCoachResponse("Ich will naechste Woche mehr trainieren. Erhoehe das Volumen um 15%.", ctx);
    expect(res?.action?.type).toBe("boost_next_week_volume");
  });

  test("6 generate marathon plan to Sept 14 (integrity)", () => {
    const plan = makePlan([]);
    const ctx = ctxFor(plan, new Date("2026-05-03T08:00:00").toISOString());
    const res = tryDeterministicCoachResponse(
      "Ich habe am 14. September einen Marathon. Erstelle mir einen Plan ab heute.",
      ctx,
    );
    expect(res?.action?.type).toBe("replace_training_plan_generated");
    const draft = generateMarathonPlanV2ToRace(new Date(ctx.todayIso), new Date(2026, 8, 14));
    expect(validateTrainingPlanV2Integrity(draft)).toBe(true);
  });

  test("8 taper with explicit keyword", () => {
    const plan = makePlan([
      { id: "race1", date: "14. Mai", day: "Do", type: "race", title: "HM", km: 21 },
      { id: "easy1", date: "13. Mai", day: "Mi", type: "easy", title: "E", km: 10 },
      { id: "iv", date: "12. Mai", day: "Di", type: "interval", title: "I", km: 12 },
    ]);
    const ctx = ctxFor(plan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse(
      "Ich bin in 10 Tagen beim Rennen. Passe meinen Plan fuer die Tapering-Phase an.",
      ctx,
    );
    expect(res?.action?.type).toBe("taper_before_race");
  });

  test("9 HR zone uses profile BPM", () => {
    const ctx = ctxFor(makePlan([]), new Date("2026-05-03T08:00:00").toISOString(), { maxHeartRateBpm: 180 });
    const res = tryDeterministicCoachResponse("In welcher Herzfrequenzzone soll ich meine langen Laeufe absolvieren?", ctx);
    expect(res?.message.match(/\d{3}/)?.[0]).toBeTruthy();
  });

  test("10 progress / sub-3 narrative", () => {
    const plan = makePlan([{ id: "d", date: "1. Mai", day: "Fr", type: "easy", title: "x", km: 8 }]);
    const logs = { d: { done: true } };
    const c = ctxFor(plan, new Date("2026-05-05T08:00:00").toISOString(), { logs });
    const res = tryDeterministicCoachResponse("Bin ich auf Kurs fuer einen Sub-3h Marathon?", c);
    expect(res?.message.toLowerCase()).toMatch(/sub|zielreferenz|fortschritt|gesamtplan|treue|adherence|score/);
  });

  test("7 missed yesterday suggests patch when today is runnable", () => {
    const plan = makePlan([
      { id: "y", date: "4. Mai", day: "Mo", type: "easy", title: "Gestern Easy", km: 10 },
      { id: "t", date: "5. Mai", day: "Di", type: "easy", title: "Heute Easy", km: 8 },
    ]);
    const ctx = ctxFor(plan, new Date("2026-05-05T12:00:00").toISOString(), {
      logs: {},
    });
    const res = tryDeterministicCoachResponse("Ich habe das gestrige Training verpasst. Was soll ich tun?", ctx);
    expect(res?.message.toLowerCase()).toMatch(/gestern|teil|streichen/i);
    expect(res?.action?.type).toBe("integrate_missed_workout");
  });

  test("3 strip bike", () => {
    const plan = makePlan([
      { id: "b1", date: "10. Mai", day: "Sa", type: "bike", title: "Rad", km: 0 },
      { id: "r1", date: "11. Mai", day: "So", type: "easy", title: "E", km: 10 },
    ]);
    const ctx = ctxFor(plan, new Date("2026-05-05T08:00:00").toISOString());
    const res = tryDeterministicCoachResponse("Streiche alle Rennrad-Einheiten aus meinem Marathonplan.", ctx);
    expect(res?.action?.type).toBe("remove_all_bike_sessions");
  });
});

describe("extractRelativeDaysUntilRaceGerman", () => {
  test("relative phrases", () => {
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("übermorgen Rennen"))).toBe(2);
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("in 10 Tagen"))).toBe(10);
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("in 2 Wochen Marathon"))).toBe(14);
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("in 3 Wochen"))).toBe(21);
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("in einem Monat"))).toBe(30);
    expect(extractRelativeDaysUntilRaceGerman(normalizeCoachText("nächste Woche Sonntag Rennen"))).toBe(7);
  });
});

describe("taper anchor + relative days", () => {
  const taperPlan = makePlan([
    { id: "iv", date: "12. Mai", day: "Di", type: "interval", title: "I", km: 12 },
    { id: "easy1", date: "13. Mai", day: "Mi", type: "easy", title: "E", km: 10 },
  ]);

  test("message 'in 10 Tagen' produces override ISO (no stored raceDateIso)", () => {
    const ctx = ctxFor(taperPlan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse(
      "Ich bin in 10 Tagen beim Rennen. Passe meinen Plan fuer die Tapering-Phase an.",
      ctx,
    );
    expect(res?.action?.type).toBe("taper_before_race");
    expect(String(res?.action?.payload?.raceDateIsoOverride)).toContain("2026-05-13");
  });

  test("in 2 Wochen + taper keyword", () => {
    const ctx = ctxFor(taperPlan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse("In 2 Wochen ist mein Marathon. Tapering bitte.", ctx);
    expect(res?.action?.type).toBe("taper_before_race");
    expect(String(res?.action?.payload?.raceDateIsoOverride)).toContain("2026-05-17");
  });

  test("nächste Woche Sonntag + Rennen", () => {
    const planNextSun = makePlan([
      { id: "iv", date: "8. Mai", day: "Fr", type: "interval", title: "I", km: 12 },
      { id: "easy1", date: "9. Mai", day: "Sa", type: "easy", title: "E", km: 10 },
    ]);
    const ctx = ctxFor(planNextSun, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse("Nächste Woche Sonntag ist das Rennen. Taper bitte.", ctx);
    expect(res?.action?.type).toBe("taper_before_race");
    expect(String(res?.action?.payload?.raceDateIsoOverride)).toContain("2026-05-10");
  });

  test("taper only without date or stored race → ask for date", () => {
    const ctx = ctxFor(taperPlan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse("Passe den Taper an", ctx);
    expect(res?.action).toBeUndefined();
    expect(res?.message).toMatch(/Renndatum|Wettkampf/);
  });

  test("relative 'in 10 Tagen' overrides stored raceDateIso", () => {
    const stored = new Date("2026-09-27T12:00:00").toISOString();
    const ctx = ctxFor(taperPlan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: stored });
    const res = tryDeterministicCoachResponse("In 10 Tagen ist mein Rennen. Taper bitte.", ctx);
    expect(res?.action?.type).toBe("taper_before_race");
    expect(String(res?.action?.payload?.raceDateIsoOverride)).toContain("2026-05-13");
  });

  test("2-day lead warns about minimal taper", () => {
    const plan = makePlan([{ id: "e", date: "4. Mai", day: "Mo", type: "easy", title: "E", km: 10 }]);
    const ctx = ctxFor(plan, new Date("2026-05-03T08:00:00").toISOString(), { raceDateIso: null });
    const res = tryDeterministicCoachResponse("In 2 Tagen ist das Rennen. Taper bitte.", ctx);
    expect(res?.action?.type).toBe("taper_before_race");
    expect(res?.message?.toLowerCase()).toMatch(/kurze vorlaufzeit|minimal/);
  });
});
