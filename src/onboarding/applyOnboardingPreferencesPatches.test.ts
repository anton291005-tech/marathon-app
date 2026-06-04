import {
  buildOnboardingPlanApiPayload,
  extractPlanWorkouts,
  parsePlanPatchesFromAnthropicText,
} from "./applyOnboardingPreferencesPatches";
import type { TrainingPlanV2 } from "../planV2/types";

describe("buildOnboardingPlanApiPayload", () => {
  it("includes workouts from top-level plan", () => {
    const plan: TrainingPlanV2 = {
      version: 2,
      workouts: [
        {
          id: "w1",
          dateIso: "2026-01-05T11:00:00.000Z",
          sport: "run",
          sessionType: "easy",
          title: "Easy",
          km: 10,
        },
      ],
      weeks: [],
    };
    const { plan: apiPlan } = buildOnboardingPlanApiPayload(plan);
    expect(apiPlan.workouts).toHaveLength(1);
    expect(apiPlan.workouts[0].id).toBe("w1");
  });

  it("falls back to weeks when top-level workouts are empty", () => {
    const w = {
      id: "w2",
      dateIso: "2026-01-06T11:00:00.000Z",
      sport: "run" as const,
      sessionType: "easy",
      title: "Easy",
      km: 8,
    };
    const plan: TrainingPlanV2 = {
      version: 2,
      workouts: [],
      weeks: [{ startIso: "2026-01-05", totalKm: 8, workouts: [w] }],
    };
    expect(extractPlanWorkouts(plan)).toHaveLength(1);
    expect(buildOnboardingPlanApiPayload(plan).plan.workouts).toHaveLength(1);
  });
});

describe("parsePlanPatchesFromAnthropicText", () => {
  it("parses a JSON array of patches", () => {
    const patches = parsePlanPatchesFromAnthropicText(
      '[{"sessionId":"w01-di","changes":{"km":0,"type":"rest"},"reason":"No Tuesday"}]',
    );
    expect(patches).toEqual([
      { sessionId: "w01-di", changes: { km: 0, type: "rest" }, reason: "No Tuesday" },
    ]);
  });

  it("maps notes to desc", () => {
    const patches = parsePlanPatchesFromAnthropicText(
      '[{"sessionId":"w02-mo","changes":{"notes":"Krafttraining"},"reason":"Strength"}]',
    );
    expect(patches[0].changes.desc).toBe("Krafttraining");
  });

  it("strips markdown fences", () => {
    const patches = parsePlanPatchesFromAnthropicText(
      '```json\n[{"sessionId":"a","changes":{"title":"Easy"}}]\n```',
    );
    expect(patches).toEqual([{ sessionId: "a", changes: { title: "Easy" } }]);
  });
});
