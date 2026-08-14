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

  it("a day-swap patch re-sorts sessions into chronological order, not base-array order", () => {
    const v2two = buildTrainingPlanV2FromBasePlan(tinyTwoSessionPlan);
    // w01-di is first in the base array (1. Jan); w01-mi is second (2. Jan).
    // A swap patches w01-di to the later date and w01-mi to the earlier one —
    // the base array order is now the reverse of the chronological order.
    const swapPatches: PlanPatch[] = [
      { sessionId: "w01-di", changes: { day: "Mi", date: "3. Jan" } },
      { sessionId: "w01-mi", changes: { day: "Di", date: "1. Jan" } },
    ];
    const display = deriveDisplayPlan(v2two, swapPatches);
    expect(display[0]?.s.map((s) => s.id)).toEqual(["w01-mi", "w01-di"]);
  });

  it("two chained swaps in the same week stay chronologically sorted", () => {
    // Real Mon(5.)-Sun(11.) week of Jan 2026, so the base-plan builder keeps
    // all three sessions in one calendar week (avoids accidental week-splitting).
    const threeSessionBase: PlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "T",
        dates: "",
        km: 30,
        focus: "",
        s: [
          { id: "w01-mo", day: "Mo", date: "5. Jan", type: "easy", title: "A", km: 8, desc: "", pace: null },
          { id: "w01-mi", day: "Mi", date: "7. Jan", type: "easy", title: "B", km: 10, desc: "", pace: null },
          { id: "w01-sa", day: "Sa", date: "10. Jan", type: "easy", title: "C", km: 12, desc: "", pace: null },
        ],
      },
    ];
    const v2three = buildTrainingPlanV2FromBasePlan(threeSessionBase);
    // Swap 1: Mi <-> Sa. Swap 2: Mo <-> Do (Do lands between Mi and Sa's new positions).
    const chainedPatches: PlanPatch[] = [
      { sessionId: "w01-mi", changes: { day: "Sa", date: "10. Jan" } },
      { sessionId: "w01-sa", changes: { day: "Mi", date: "7. Jan" } },
      { sessionId: "w01-mo", changes: { day: "Do", date: "8. Jan" } },
    ];
    const display = deriveDisplayPlan(v2three, chainedPatches);
    expect(display[0]?.s.map((s) => s.id)).toEqual(["w01-sa", "w01-mo", "w01-mi"]);
  });

  it("a session with an unparseable date sorts to the end, not the front", () => {
    const v2two = buildTrainingPlanV2FromBasePlan(tinyTwoSessionPlan);
    // w01-di is first in the base array (1. Jan) but its patched date is unparseable —
    // it must not be treated as epoch (which would keep it sorted first); the file's
    // own sortByDateAscending convention pushes unparseable dates to the end.
    const patches: PlanPatch[] = [{ sessionId: "w01-di", changes: { date: "" } }];
    const display = deriveDisplayPlan(v2two, patches);
    expect(display[0]?.s.map((s) => s.id)).toEqual(["w01-mi", "w01-di"]);
  });
});
