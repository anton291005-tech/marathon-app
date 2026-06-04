import {
  buildHealthLinkableSessionPool,
  getAssignableHealthLinkPlanSessions,
  getAssignableHealthLinkPlanSessionsWithMeta,
  HEALTH_LINK_RUN_TYPES,
} from "./healthLinkAssignableSessions";
import type { PlanSession } from "../marathonPrediction";

function sess(id: string, type: string): PlanSession {
  return { id, day: "Mo", date: "1. Jan", type, title: "T", km: 0 };
}

describe("healthLinkAssignableSessions", () => {
  test("selecting bike → list includes bike sessions when plan has them", () => {
    const pool = buildHealthLinkableSessionPool([sess("a", "easy"), sess("b", "bike"), sess("c", "long")]);
    const assignable = getAssignableHealthLinkPlanSessions("bike", pool);
    expect(assignable.some((s) => s.type === "bike")).toBe(true);
    expect(assignable.map((s) => s.id)).toContain("b");
  });

  test("selecting run → only running session types from pool", () => {
    const pool = buildHealthLinkableSessionPool([sess("a", "easy"), sess("b", "bike"), sess("c", "long")]);
    const assignable = getAssignableHealthLinkPlanSessions("run", pool);
    expect(assignable.every((s) => HEALTH_LINK_RUN_TYPES.has(s.type))).toBe(true);
    expect(assignable.some((s) => s.type === "bike")).toBe(false);
  });

  test("selecting bike does not return empty when pool has no bike rows (fallback)", () => {
    const pool = buildHealthLinkableSessionPool([sess("a", "easy"), sess("c", "long")]);
    expect(pool.some((s) => s.type === "bike")).toBe(false);
    const meta = getAssignableHealthLinkPlanSessionsWithMeta("bike", pool);
    expect(meta.usedFallback).toBe(true);
    expect(meta.assignable.length).toBeGreaterThan(0);
    expect(meta.assignable).toEqual(pool);
  });

  test("withMeta: bike filter hits sets usedFallback false", () => {
    const pool = buildHealthLinkableSessionPool([sess("a", "easy"), sess("b", "bike")]);
    const meta = getAssignableHealthLinkPlanSessionsWithMeta("bike", pool);
    expect(meta.usedFallback).toBe(false);
    expect(meta.filteredTypes).toContain("bike");
  });

  test("pool builder excludes rest and strength", () => {
    const pool = buildHealthLinkableSessionPool([
      sess("r", "rest"),
      sess("st", "strength"),
      sess("e", "easy"),
      sess("bk", "bike"),
    ]);
    expect(pool.map((s) => s.id).sort()).toEqual(["bk", "e"]);
  });
});
