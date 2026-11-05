import { randomInputs } from "../__fixtures__/randomInputs";
import { codesOf } from "../__fixtures__/compact";
import { checkPlan, taperMeanOf } from "../invariants";
import { planSessions } from "../planSessions";

const SEED = 20261107;
const CASES = 2000;

describe(`Invarianten über zufällige Pläne (Seed ${SEED}, ${CASES} Fälle)`, () => {
  it("checkPlan: 0 errors, 0 warnings außer begründeten Abweichungen; I20 (zweimal gerechnet, identisch)", () => {
    const problems: string[] = [];
    const seen: Record<string, number> = {};
    const reasonedRules: Record<string, number> = {};
    for (let index = 0; index < CASES; index += 1) {
      const { inputs, todayYmd } = randomInputs(SEED + index);
      const plan = planSessions(inputs, todayYmd);
      const result = checkPlan(plan, inputs);
      codesOf(result.violations.filter((v) => !v.reasoned)).forEach((code) => problems.push(`seed ${SEED + index}: ${code}`));
      result.violations.filter((v) => v.reasoned).forEach((v) => (reasonedRules[`${v.code}/${v.rule}`] = (reasonedRules[`${v.code}/${v.rule}`] || 0) + 1));
      // I20: gleiche Eingaben → identischer Plan
      if (JSON.stringify(planSessions(inputs, todayYmd)) !== JSON.stringify(plan)) problems.push(`seed ${SEED + index}: I20`);

      if (plan.volume.weeks.some((w) => w.curveKm > w.fullWeekKm)) seen["capacity-capped"] = (seen["capacity-capped"] || 0) + 1;
      const taper = taperMeanOf(plan, inputs);
      if (taper !== null) seen[taper.inRange ? "taper-mean-in-range" : "taper-mean-excused"] = (seen[taper.inRange ? "taper-mean-in-range" : "taper-mean-excused"] || 0) + 1;
      plan.weeks.forEach((week) => {
        week.notes.forEach((note) => (seen[note] = (seen[note] || 0) + 1));
        week.sessions.forEach((s) => {
          seen[`kind:${s.kind}`] = (seen[`kind:${s.kind}`] || 0) + 1;
          s.notes.forEach((note) => (seen[note] = (seen[note] || 0) + 1));
        });
      });
    }
    expect(problems.length === 0 ? [] : [problems.length, ...problems.slice(0, 15)]).toEqual([]);
    // Taper-Mittel außerhalb von −41 bis −60 % nur begründet (Limits/Mindestdauern/Tragfähigkeit).
    expect(seen["taper-mean-in-range"]).toBeGreaterThan(200);
    expect(seen["taper-mean-excused"] || 0).toBeLessThan(CASES * 0.05);
    // Die Fälle decken die Arten und Sonderfälle wirklich ab.
    [
      "kind:T",
      "kind:I",
      "kind:R",
      "kind:M",
      "kind:LR+M",
      "kind:MLR",
      "kind:REC",
      "q-softened-budget",
      "q-softened-recovery-week",
      "q-softened-beginner-race-week",
      "taper-long-run-cut",
      "m-block-near-long-run",
      "week-km-reduced",
      "e-shortened-to-long-run",
      "e-above-75-percent-long-run",
      "long-run-raised-to-minimum",
      "q1-scaled-recovery-week",
      "e-shortened-to-fit-week",
      "capacity-capped",
    ].forEach((key) => expect([key, (seen[key] || 0) > 0]).toEqual([key, true]));
    // Welche begründeten Regeln vorkommen (Häufigkeit im Bericht zu Schritt 7a, docs/plan-core-plan.md).
    expect(Object.keys(reasonedRules).sort()).toMatchSnapshot();
  });
});
