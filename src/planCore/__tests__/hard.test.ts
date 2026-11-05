import { CONFIG } from "../config";
import { findHardSpacingViolations, isHardSession, isHardSlot } from "../hard";
import type { PlacedSlot } from "../templates";
import type { CoreKind } from "../types";

const ALL_KINDS: CoreKind[] = ["REC", "E", "MLR", "LR", "LR+M", "M", "T", "I", "R", "RACE", "REST"];

describe("isHardSession (§1)", () => {
  it("I, T, R und das Rennen sind immer hart, auch ohne Dauer und km", () => {
    (["I", "T", "R", "RACE"] as CoreKind[]).forEach((kind) => {
      expect(isHardSession({ kind })).toBe(true);
      expect(isHardSession({ kind, durationMinutes: 10, kmAtMPaceOrFaster: 0 })).toBe(true);
    });
  });

  it("E, REC, MLR und Ruhetag sind nie hart, auch lang und schnell gemeldet", () => {
    (["E", "REC", "MLR", "REST"] as CoreKind[]).forEach((kind) => {
      expect(isHardSession({ kind, durationMinutes: 300, kmAtMPaceOrFaster: 40 })).toBe(false);
    });
  });

  it("Long Run ab 90 min hart (Grenze aus der Config)", () => {
    const limit = CONFIG.hardSession.longRunMinutes.value;
    expect(limit).toBe(90);
    expect(isHardSession({ kind: "LR", durationMinutes: limit - 1 })).toBe(false);
    expect(isHardSession({ kind: "LR", durationMinutes: limit })).toBe(true);
    expect(isHardSession({ kind: "LR", durationMinutes: 150 })).toBe(true);
  });

  it("M ab 5 km hart, darunter nicht", () => {
    const limit = CONFIG.hardSession.kmAtMPaceOrFaster.value;
    expect(limit).toBe(5);
    expect(isHardSession({ kind: "M", kmAtMPaceOrFaster: limit - 0.1 })).toBe(false);
    expect(isHardSession({ kind: "M", kmAtMPaceOrFaster: limit })).toBe(true);
  });

  it("LR+M ist hart, wenn der Long Run lang genug ist oder der M-Block mindestens 5 km hat", () => {
    expect(isHardSession({ kind: "LR+M", durationMinutes: 80, kmAtMPaceOrFaster: 4 })).toBe(false);
    expect(isHardSession({ kind: "LR+M", durationMinutes: 80, kmAtMPaceOrFaster: 5 })).toBe(true);
    expect(isHardSession({ kind: "LR+M", durationMinutes: 90, kmAtMPaceOrFaster: 0 })).toBe(true);
  });

  it("ohne Dauer oder km lässt sich die Schwelle nicht belegen: nicht hart", () => {
    expect(isHardSession({ kind: "LR" })).toBe(false);
    expect(isHardSession({ kind: "M" })).toBe(false);
    expect(isHardSession({ kind: "LR+M" })).toBe(false);
  });
});

describe("Hart-Annahme der Platzierung (isHardSlot)", () => {
  const SLOT_KINDS: Array<[PlacedSlot, CoreKind[]]> = [
    ["LR", ["LR", "LR+M"]],
    ["Q1", ["I", "T", "R", "M", "E"]],
    ["Q1L", ["I", "T", "R", "M", "E"]],
    ["Q2", ["I", "T", "R", "M", "E"]],
    ["MLR", ["MLR"]],
    ["E", ["E"]],
    ["REC", ["REC"]],
    ["RACE", ["RACE"]],
    ["REST", ["REST"]],
  ];

  it("jede Art, die ein Slot annehmen kann, ist nur hart, wenn der Slot als hart gilt (Monotonie)", () => {
    const problems: string[] = [];
    SLOT_KINDS.forEach(([slot, kinds]) => {
      kinds.forEach((kind) => {
        [0, 5, 30, 90, 150].forEach((durationMinutes) => {
          [0, 4.9, 5, 29].forEach((kmAtMPaceOrFaster) => {
            if (isHardSession({ kind, durationMinutes, kmAtMPaceOrFaster }) && !isHardSlot(slot)) {
              problems.push(`${slot}:${kind}:${durationMinutes}:${kmAtMPaceOrFaster}`);
            }
          });
        });
      });
    });
    expect(problems).toEqual([]);
  });

  it("alle Arten sind in der Slot-Tabelle des Tests erfasst, die weichen Slots sind nie hart", () => {
    const covered: Record<string, boolean> = {};
    SLOT_KINDS.forEach(([, kinds]) => kinds.forEach((kind) => (covered[kind] = true)));
    expect(ALL_KINDS.filter((kind) => !covered[kind])).toEqual([]);
    (["MLR", "E", "REC", "REST"] as PlacedSlot[]).forEach((slot) => expect(isHardSlot(slot)).toBe(false));
    (["LR", "Q1", "Q1L", "Q2", "RACE"] as PlacedSlot[]).forEach((slot) => expect(isHardSlot(slot)).toBe(true));
  });
});

describe("findHardSpacingViolations (I6)", () => {
  const day = (ymd: string, hard: boolean) => ({ ymd, hard });

  it("erkennt So → Mo über die Wochengrenze", () => {
    const days = [day("2027-01-09", false), day("2027-01-10", true), day("2027-01-11", true), day("2027-01-12", false)];
    expect(findHardSpacingViolations(days)).toEqual(["hard-too-close:2027-01-10>2027-01-11"]);
  });

  it("ein lockerer Tag dazwischen genügt", () => {
    const days = [day("2027-01-10", true), day("2027-01-11", false), day("2027-01-12", true)];
    expect(findHardSpacingViolations(days)).toEqual([]);
  });

  it("sortiert selbst und behandelt Lücken in der Liste als locker", () => {
    expect(findHardSpacingViolations([day("2027-01-12", true), day("2027-01-10", true)])).toEqual([]);
    expect(findHardSpacingViolations([day("2027-01-11", true), day("2027-01-10", true)])).toHaveLength(1);
  });

  it("zwei harte Einheiten am selben Tag sind ein Verstoß", () => {
    expect(findHardSpacingViolations([day("2027-01-10", true), day("2027-01-10", true)])).toHaveLength(1);
  });

  it("ohne harte Tage keine Verstöße", () => {
    expect(findHardSpacingViolations([])).toEqual([]);
    expect(findHardSpacingViolations([day("2027-01-10", false), day("2027-01-11", false)])).toEqual([]);
  });
});
