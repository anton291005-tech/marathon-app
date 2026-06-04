import { deriveDisplayPlan } from "./deriveDisplayPlan";
import type { PlanPatch } from "../lib/ai/types";
import { buildTrainingPlanV2FromBasePlan } from "../planV2/fromBasePlan";
import { toPlanWeeks } from "../planV2/toPlanWeeks";
import type { PlanWeek } from "../marathonPrediction";

/** Minimal embedded week slice for deterministic tests (ids match typical seed plan). */
const tinyBasePlan: PlanWeek[] = [
  {
    wn: 1,
    phase: "BASE",
    label: "T",
    dates: "",
    km: 10,
    focus: "",
    s: [
      {
        id: "w01-di",
        day: "Di",
        date: "1. Jan",
        type: "easy",
        title: "Easy",
        km: 10,
        desc: "",
        pace: null,
      },
    ],
  },
];

const tinyTwoSessionPlan: PlanWeek[] = [
  {
    wn: 1,
    phase: "BASE",
    label: "T",
    dates: "",
    km: 20,
    focus: "",
    s: [
      {
        id: "w01-di",
        day: "Di",
        date: "1. Jan",
        type: "easy",
        title: "Easy",
        km: 10,
        desc: "",
        pace: null,
      },
      {
        id: "w01-mi",
        day: "Mi",
        date: "2. Jan",
        type: "easy",
        title: "Easy 2",
        km: 12,
        desc: "",
        pace: null,
      },
    ],
  },
];

describe("deriveDisplayPlan", () => {
  const v2 = buildTrainingPlanV2FromBasePlan(tinyBasePlan);

  it("same inputs yield same serialized output", () => {
    const patches: PlanPatch[] = [{ sessionId: "w01-di", changes: { title: "Patched title" } }];
    const a = JSON.stringify(deriveDisplayPlan(v2, patches));
    const b = JSON.stringify(deriveDisplayPlan(v2, patches));
    expect(a).toBe(b);
  });

  it("noop / empty patches match toPlanWeeks + applyPlanPatches identity", () => {
    const withEmpty = deriveDisplayPlan(v2, []);
    const withUndefined = deriveDisplayPlan(v2, undefined);
    const withGarbageObject = deriveDisplayPlan(v2, { not: "patches" });
    const raw = toPlanWeeks(v2);
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(withUndefined));
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(withGarbageObject));
    expect(withEmpty.map((w) => w.label)).toEqual(raw.map((w) => w.label));
  });

  it("with patches, display differs from unpatch V2 projection", () => {
    const baseProjection = toPlanWeeks(v2);
    const patches: PlanPatch[] = [{ sessionId: "w01-di", changes: { km: 99 } }];
    const display = deriveDisplayPlan(v2, patches);
    const mergedKm = display[0]?.s.find((s) => s.id === "w01-di")?.km;
    const baseKm = baseProjection[0]?.s.find((s) => s.id === "w01-di")?.km;
    expect(mergedKm).toBe(99);
    expect(baseKm).not.toBe(99);
  });

  it("disjoint patches: list order does not change merged display", () => {
    const v2two = buildTrainingPlanV2FromBasePlan(tinyTwoSessionPlan);
    const ab: PlanPatch[] = [
      { sessionId: "w01-di", changes: { km: 5 } },
      { sessionId: "w01-mi", changes: { km: 6 } },
    ];
    const ba: PlanPatch[] = [
      { sessionId: "w01-mi", changes: { km: 6 } },
      { sessionId: "w01-di", changes: { km: 5 } },
    ];
    expect(JSON.stringify(deriveDisplayPlan(v2two, ab))).toBe(JSON.stringify(deriveDisplayPlan(v2two, ba)));
  });
});
