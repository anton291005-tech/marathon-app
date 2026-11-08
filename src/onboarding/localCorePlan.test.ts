import { buildLocalCorePlan } from "./localCorePlan";
import { PROFILES } from "../planCore/__fixtures__/profiles";
import { randomInputs } from "../planCore/__fixtures__/randomInputs";
import { wizardProfileOf } from "../testSupport/planCoreComparison";
import { attemptCorePlan } from "../../api/_lib/planCoreRoute";

const { validatePlanBody } = require("../../api/_lib/inputLimits");

describe("buildLocalCorePlan (Plan-Kern in der App, Schritt 11)", () => {
  it("P1–P6 und 100 Zufallsprofile: 0 errors und derselbe Plan wie der Server im Modus on", () => {
    const cases = PROFILES.map((p) => ({ inputs: p.inputs, todayYmd: p.todayYmd }));
    for (let seed = 20261111; seed < 20261111 + 100; seed += 1) cases.push(randomInputs(seed));
    cases.forEach(({ inputs, todayYmd }) => {
      const profile = wizardProfileOf(inputs);
      const local = buildLocalCorePlan(profile, todayYmd);
      const server = attemptCorePlan(validatePlanBody({ profile }).payload.profile, todayYmd);
      expect(local.status).toBe("ok");
      expect(server.status).toBe("ok");
      const localPlan = local.status === "ok" ? local.plan : null;
      const serverPlan = server.status === "ok" ? server.plan : undefined;
      expect(localPlan).toEqual(serverPlan);
    });
  });

  it("zu kurzer Plan → rejected (Angaben ändern)", () => {
    const p4 = PROFILES.find((p) => p.name === "P4")!;
    const profile = { ...wizardProfileOf(p4.inputs), planStartDate: "1.03.2027" };
    expect(buildLocalCorePlan(profile, p4.todayYmd)).toEqual({ status: "rejected", reason: "plan-too-short", errors: 0 });
  });

  it("fehlende Plan-Eingaben oder andere Distanz → unavailable", () => {
    const p3 = PROFILES.find((p) => p.name === "P3")!;
    const { runDaysPerWeek, ...withoutRunDays } = wizardProfileOf(p3.inputs);
    expect(runDaysPerWeek).toBe(5);
    expect(buildLocalCorePlan(withoutRunDays, p3.todayYmd)).toEqual({ status: "unavailable", reason: "inputs-missing" });
    expect(buildLocalCorePlan({ ...wizardProfileOf(p3.inputs), raceDistanceKm: 15 }, p3.todayYmd)).toEqual({
      status: "unavailable",
      reason: "distance-unsupported",
    });
  });

  it("kein Freitext im Plan", () => {
    const p2 = PROFILES.find((p) => p.name === "P2")!;
    const result = buildLocalCorePlan({ ...wizardProfileOf(p2.inputs), userPreferences: ["ZZ-WUNSCH-81"] }, p2.todayYmd);
    expect(result.status).toBe("ok");
    expect(JSON.stringify(result)).not.toContain("ZZ-WUNSCH-81");
  });
});
