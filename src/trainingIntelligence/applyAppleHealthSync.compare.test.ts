import { compareHealthSyncPairByRecencyThenRunId } from "./applyAppleHealthSync";
import type { StoredHealthRun } from "../healthRuns";

describe("compareHealthSyncPairByRecencyThenRunId", () => {
  const mk = (runId: string, startTime: number): { stored: StoredHealthRun; norm: { startTime: number } } => ({
    stored: {
      runId,
      startDate: new Date(startTime).toISOString(),
      duration: 1000,
      distanceMeters: 1000,
      distanceUnknown: false,
      workoutType: "running",
    },
    norm: { startTime },
  });

  it("sorts by startTime descending", () => {
    const a = mk("a", 100);
    const b = mk("b", 200);
    expect(compareHealthSyncPairByRecencyThenRunId(a, b)).toBeGreaterThan(0);
    expect(compareHealthSyncPairByRecencyThenRunId(b, a)).toBeLessThan(0);
  });

  it("tie-breaks equal startTime by runId (lexicographic)", () => {
    const late = mk("hk_zzz", 500);
    const earlyId = mk("hk_aaa", 500);
    expect(compareHealthSyncPairByRecencyThenRunId(late, earlyId)).toBeGreaterThan(0);
    expect(compareHealthSyncPairByRecencyThenRunId(earlyId, late)).toBeLessThan(0);
  });
});
