// Plan-Kern Schritt 7b: Vertrag zwischen `buildPlan` und der App. Der fertige Plan übersteht `normalizeTrainingPlan`
// unverändert (die Pflichtgrenze jedes Lese-/Schreibpfads), besteht `validateTrainingPlanV2Integrity` und lässt sich
// mit `deriveDisplayPlan` anzeigen. P1–P6 und 200 Zufallspläne.

import { validateTrainingPlanV2Integrity } from "../ai/validation/validateTrainingPlanV2Integrity";
import { deriveDisplayPlan } from "../displayPlan/deriveDisplayPlan";
import { buildPlan } from "../planCore/buildPlan";
import { PROFILES } from "../planCore/__fixtures__/profiles";
import { randomInputs } from "../planCore/__fixtures__/randomInputs";
import { EMPTY_RULES } from "../planCore/types";
import type { CoreInputs } from "../planCore/types";
import { normalizeTrainingPlan } from "../planV2/normalizeTrainingPlan";

type Case = { label: string; inputs: CoreInputs; todayYmd: string };

const CASES: Case[] = PROFILES.map((p) => ({ label: p.name, inputs: p.inputs, todayYmd: p.todayYmd }));
for (let index = 0; index < 200; index += 1) {
  const { inputs, todayYmd } = randomInputs(20261107 + index);
  CASES.push({ label: `seed ${20261107 + index}`, inputs, todayYmd });
}

describe("buildPlan ↔ App (Schritt 7b)", () => {
  it.each(CASES.map((c) => [c.label, c] as [string, Case]))("%s: normalizeTrainingPlan unverändert, Integrität, Anzeige", (_label, c) => {
    const plan = buildPlan(c.inputs, EMPTY_RULES, c.todayYmd);
    expect(normalizeTrainingPlan(plan)).toEqual(plan);
    expect(validateTrainingPlanV2Integrity(plan)).toBe(true);
    const display = deriveDisplayPlan(plan, []);
    expect(display).toHaveLength(plan.weeks.length);
  });
});
