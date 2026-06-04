/**
 * Unit tests for avgHeartRateBpm preservation across mergeHealthRuns deduplication.
 */
import { mergeHealthRuns } from "./healthRuns";
import type { StoredHealthRun } from "./healthRuns";

function makeRun(overrides: Partial<StoredHealthRun> & { runId: string }): StoredHealthRun {
  return {
    startDate: "2026-05-01T07:00:00.000Z",
    duration: 3000,
    distanceMeters: 10000,
    distanceUnknown: false,
    workoutType: "running",
    sourceName: "Apple Health",
    ...overrides,
  };
}

describe("mergeHealthRuns — avgHeartRateBpm preservation", () => {
  test("duplicate runs: winner without HR inherits HR from the other run", () => {
    const withoutHr = makeRun({ runId: "hk_aaa" });
    const withHr = makeRun({ runId: "hk_bbb", avgHeartRateBpm: 152 });

    // Both represent the same physical workout (same start/duration/type within fuzzy window).
    const result = mergeHealthRuns([withoutHr], [withHr]);

    expect(result).toHaveLength(1);
    expect(result[0].avgHeartRateBpm).toBe(152);
  });

  test("duplicate runs: run with platformId wins score but still keeps HR from counterpart", () => {
    // platformId gives +4 score points, HR gives +1 — platform run wins overall
    // but must inherit HR from the HR-only run.
    const platformRun = makeRun({ runId: "hk_platform", platformId: "uuid-platform-abc" });
    const hrRun = makeRun({ runId: "hk_hronly", avgHeartRateBpm: 165 });

    const result = mergeHealthRuns([platformRun], [hrRun]);

    expect(result).toHaveLength(1);
    // platformId run wins, but must carry HR
    expect(result[0].platformId).toBe("uuid-platform-abc");
    expect(result[0].avgHeartRateBpm).toBe(165);
  });

  test("duplicate runs: when both have HR, winner keeps its own HR value", () => {
    const runA = makeRun({ runId: "hk_aaa", avgHeartRateBpm: 148 });
    const runB = makeRun({ runId: "hk_bbb", avgHeartRateBpm: 155 });

    const result = mergeHealthRuns([runA], [runB]);

    expect(result).toHaveLength(1);
    // The winner's own HR is preserved (not overwritten by loser)
    expect(typeof result[0].avgHeartRateBpm).toBe("number");
    expect([148, 155]).toContain(result[0].avgHeartRateBpm);
  });

  test("non-duplicate runs are kept separately with their individual HR values", () => {
    const run1 = makeRun({ runId: "hk_1", startDate: "2026-05-01T07:00:00.000Z", avgHeartRateBpm: 150 });
    const run2 = makeRun({ runId: "hk_2", startDate: "2026-05-02T07:00:00.000Z", avgHeartRateBpm: 160 });

    const result = mergeHealthRuns([], [run1, run2]);

    expect(result).toHaveLength(2);
    expect(result.find(r => r.runId === "hk_1")?.avgHeartRateBpm).toBe(150);
    expect(result.find(r => r.runId === "hk_2")?.avgHeartRateBpm).toBe(160);
  });
});
