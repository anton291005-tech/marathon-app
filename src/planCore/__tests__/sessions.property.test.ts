import { randomInputs } from "../__fixtures__/randomInputs";
import { checkSessionPlan, checkVolumeGrowth, taperMeanOf } from "../__fixtures__/sessionChecks";
import { planSessions } from "../planSessions";

const SEED = 20261107;
const CASES = 2000;

describe(`Einheiten über zufällige Pläne (Seed ${SEED}, ${CASES} Fälle)`, () => {
  it("I1, I2, I6, I8–I15, I17 und die Schritt-6-Regeln halten", () => {
    const problems: string[] = [];
    const seen: Record<string, number> = {};
    for (let index = 0; index < CASES; index += 1) {
      const { inputs, todayYmd } = randomInputs(SEED + index);
      const plan = planSessions(inputs, todayYmd);
      checkSessionPlan(plan, inputs).forEach((code) => problems.push(`seed ${SEED + index}: ${code}`));
      checkVolumeGrowth(plan, inputs).forEach((code) => problems.push(`seed ${SEED + index}: ${code}`));
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
    // Taper-Mittel außerhalb von −41 bis −60 % nur mit Hinweis (Limits/Mindestdauern); Stand Schritt 6: 62 von 277 geprüften Plänen.
    expect(seen["taper-mean-in-range"]).toBeGreaterThan(200);
    expect(seen["taper-mean-excused"] || 0).toBeLessThan(CASES * 0.05);
    // Die Fälle decken die Arten und Sonderfälle wirklich ab.
    ["kind:T", "kind:I", "kind:R", "kind:M", "kind:LR+M", "kind:MLR", "kind:REC", "q-softened-budget", "q-softened-recovery-week", "q-softened-beginner-race-week", "taper-long-run-cut", "m-block-near-long-run", "week-km-reduced", "e-shortened-to-long-run", "e-above-75-percent-long-run", "long-run-raised-to-minimum", "q1-scaled-recovery-week", "e-shortened-to-fit-week", "capacity-capped"].forEach(
      (key) => expect([key, (seen[key] || 0) > 0]).toEqual([key, true]),
    );
  });
});
