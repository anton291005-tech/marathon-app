import { assemblePlan, buildCheckedPlan, buildPlan, RECOVERY_WEEK_FOCUS_DE } from "../buildPlan";
import { CONFIG_VERSION } from "../config";
import { addDays, mondayOf } from "../dates";
import { codesOf, unreasoned } from "../__fixtures__/compact";
import { PROFILES } from "../__fixtures__/profiles";
import { randomInputs } from "../__fixtures__/randomInputs";
import { checkAssembledPlan } from "../invariants";
import { planSessions } from "../planSessions";
import { EMPTY_RULES } from "../types";
import type { CorePlan } from "../types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const keys = (plan: CorePlan, raceDate: string): string[] => checkAssembledPlan(plan, { raceDate }).violations.map((v) => `${v.code}/${v.rule}`);

describe("buildPlan (Schritt 7b)", () => {
  PROFILES.forEach((profile) => {
    it(`${profile.name}: 0 errors, 0 warnings außer begründeten; fertiger Plan ohne Verstoß`, () => {
      const { plan, check } = buildCheckedPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
      expect(check.errors).toBe(0);
      expect(codesOf(unreasoned(check.violations))).toEqual([]);
      expect(checkAssembledPlan(plan, profile.inputs).violations).toEqual([]);
    });
  });

  it("Form: eine Einheit je Plantag (Ruhetage als rest), IDs pc-<ymd>-<kind>, Mittag UTC, Woche ab Montag", () => {
    const profile = PROFILES.filter((p) => p.name === "P5")[0];
    const sessions = planSessions(profile.inputs, profile.todayYmd);
    const plan = buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
    expect(plan.workouts).toHaveLength(sessions.weeks.reduce((n, w) => n + w.sessions.length, 0));
    const first = plan.weeks[0];
    expect(first.startIso).toBe(mondayOf(first.workouts[0].dateIso.slice(0, 10)));
    expect(first.workouts[0]).toMatchObject({ id: `pc-${sessions.weeks[0].sessions[0].ymd}-REC`, dateIso: `${sessions.weeks[0].sessions[0].ymd}T12:00:00.000Z` });
    const rest = plan.workouts.filter((w) => w.kind === "REST")[0];
    expect(rest).toMatchObject({ sport: "rest", sessionType: "rest", km: 0, title: "Ruhetag" });
    expect(plan.weeks[0].meta).toEqual({ wn: 1, phase: "base", label: "Woche 1 · Grundlage", dates: expect.stringMatching(/^\d+\. [A-ZÄ][a-zä]{2} ff\.$/), focus: "Aerobe Basis aufbauen" });
    const recovery = plan.weeks.filter((w) => w.meta.isRecoveryWeek)[0];
    expect(recovery.meta.focus).toBe(RECOVERY_WEEK_FOCUS_DE);
    expect(RECOVERY_WEEK_FOCUS_DE).toMatch(/^Entlastung/);
    expect(plan.weeks[plan.weeks.length - 1].meta.focus).toBe("Rennwoche – frisch an den Start");
    expect(plan.meta).toEqual({ core: { configVersion: CONFIG_VERSION, inputs: expect.objectContaining({ distance: "m" }), rules: EMPTY_RULES } });
  });

  it("angebrochene Woche 1: dates ab dem ersten Plantag, startIso trotzdem Montag (I21)", () => {
    const profile = PROFILES.filter((p) => p.name === "P3")[0];
    const inputs = { ...profile.inputs, startYmd: addDays(profile.inputs.startYmd, 2) };
    const plan = buildPlan(inputs, EMPTY_RULES, profile.todayYmd);
    const first = plan.weeks[0];
    expect(first.workouts[0].dateIso.slice(0, 10)).toBe(inputs.startYmd);
    expect(first.startIso).toBe(mondayOf(inputs.startYmd));
    expect(first.startIso).not.toBe(inputs.startYmd);
    expect(first.meta.dates).toBe(`${Number(inputs.startYmd.slice(8, 10))}. ${["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][Number(inputs.startYmd.slice(5, 7)) - 1]} ff.`);
    expect(checkAssembledPlan(plan, inputs).violations).toEqual([]);
  });

  it("Hinweis peak-not-reached landet in meta.volumeNote", () => {
    const { inputs, todayYmd } = (() => {
      for (let seed = 20261107; seed < 20261107 + 2000; seed += 1) {
        const r = randomInputs(seed);
        if (planSessions(r.inputs, r.todayYmd).volume.notes.some((n) => n.code === "peak-not-reached")) return r;
      }
      throw new Error("kein Fall");
    })();
    const sessions = planSessions(inputs, todayYmd);
    const note = sessions.volume.notes.filter((n) => n.code === "peak-not-reached")[0];
    expect(assemblePlan(sessions, inputs, EMPTY_RULES).meta!.volumeNote).toEqual(note);
  });

  it("freeText wird nicht in meta.core.inputs gespeichert; der Plan ist sonst identisch", () => {
    const profile = PROFILES.filter((p) => p.name === "P4")[0];
    const withText = buildPlan({ ...profile.inputs, freeText: "Knie schonen, keine Hügel" }, EMPTY_RULES, profile.todayYmd);
    const without = buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
    expect(withText.meta!.core.inputs).not.toHaveProperty("freeText");
    expect(JSON.stringify(withText)).not.toContain("Knie schonen");
    expect(withText).toEqual(without);
  });

  it("I20: zweimal gebaut → identisch; Eingaben unverändert", () => {
    PROFILES.forEach((profile) => {
      const copy = clone(profile.inputs);
      expect(buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd)).toEqual(buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd));
      expect(profile.inputs).toEqual(copy);
    });
  });

  describe("Mutation je Regel am fertigen Plan", () => {
    const profile = PROFILES.filter((p) => p.name === "P5")[0];
    const fresh = (): CorePlan => buildPlan(profile.inputs, EMPTY_RULES, profile.todayYmd);
    const cases: Array<[string, (plan: CorePlan) => void]> = [
      ["I1/week-sum", (plan) => (plan.weeks[3].totalKm += 1)],
      ["I1/workouts-weeks", (plan) => plan.workouts.pop()],
      ["PLAN/duplicate-id", (plan) => (plan.workouts[1].id = plan.workouts[0].id)],
      ["I14/race", (plan) => (plan.workouts[plan.workouts.length - 1].kind = "E")],
      ["I21/week-meta", (plan) => (plan.weeks[0].meta.focus = "")],
      ["I22/recovery-focus", (plan) => (plan.weeks[3].meta.isRecoveryWeek = undefined)],
    ];
    it.each(cases)("%s", (key, mutate) => {
      const plan = fresh();
      expect(keys(plan, profile.inputs.raceDate)).toEqual([]);
      mutate(plan);
      expect(keys(plan, profile.inputs.raceDate)).toContain(key);
    });
  });

  it("Property: 2 000 Pläne fertig gebaut und geprüft, 0 errors, 0 warnings außer begründeten (Seed 20261107)", () => {
    const problems: string[] = [];
    for (let index = 0; index < 2000; index += 1) {
      const { inputs, todayYmd } = randomInputs(20261107 + index);
      const { check } = buildCheckedPlan(inputs, EMPTY_RULES, todayYmd);
      codesOf(unreasoned(check.violations)).forEach((code) => problems.push(`seed ${20261107 + index}: ${code}`));
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
