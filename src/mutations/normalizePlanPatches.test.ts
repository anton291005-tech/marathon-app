import type { PlanPatch } from "../lib/ai/types";
import { mergePlanPatchLists } from "./commitPlanPatchMutation";
import { normalizePlanPatchesForApply } from "./normalizePlanPatches";

describe("normalizePlanPatchesForApply", () => {
  it("drops empty sessionId and trims ids", () => {
    const patches = [{ sessionId: "  a  ", changes: { km: 1 } } as PlanPatch, { sessionId: "", changes: { km: 2 } } as PlanPatch];
    expect(normalizePlanPatchesForApply(patches)).toEqual([{ sessionId: "a", changes: { km: 1 } }]);
  });

  it("last input wins per sessionId, output sorted by sessionId", () => {
    const patches: PlanPatch[] = [
      { sessionId: "b", changes: { km: 1 } },
      { sessionId: "a", changes: { km: 2 } },
      { sessionId: "b", changes: { km: 3 } },
    ];
    expect(normalizePlanPatchesForApply(patches)).toEqual([
      { sessionId: "a", changes: { km: 2 } },
      { sessionId: "b", changes: { km: 3 } },
    ]);
  });

  it("empty / garbage yields empty", () => {
    expect(normalizePlanPatchesForApply([])).toEqual([]);
  });
});

describe("mergePlanPatchLists", () => {
  it("merges prev + incoming: last wins per id, stable storage order", () => {
    const prev: PlanPatch[] = [{ sessionId: "z", changes: { km: 0 } }];
    const inc: PlanPatch[] = [
      { sessionId: "a", changes: { km: 1 } },
      { sessionId: "z", changes: { km: 9 } },
    ];
    expect(mergePlanPatchLists(prev, inc)).toEqual([
      { sessionId: "z", changes: { km: 9 } },
      { sessionId: "a", changes: { km: 1 } },
    ]);
  });

  it("treats null prev like empty", () => {
    expect(mergePlanPatchLists(null, [{ sessionId: "x", changes: {} }])).toEqual([{ sessionId: "x", changes: {} }]);
  });
});
