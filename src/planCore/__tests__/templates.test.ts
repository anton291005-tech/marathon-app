import { CONFIG } from "../config";
import type { WeekSlot } from "../config";
import { slotsFor, weekModeOf } from "../templates";
import type { WeekMode } from "../templates";
import type { CorePhase, Distance, RunDays } from "../types";

const DISTANCES: Distance[] = ["5k", "10k", "hm", "m"];
const RUN_DAYS: RunDays[] = [3, 4, 5, 6];
const count = (slots: WeekSlot[], slot: WeekSlot): number => slots.filter((s) => s === slot).length;
const isQ = (slot: WeekSlot): boolean => slot === "Q1" || slot === "Q1L" || slot === "Q2";

describe("weekModeOf", () => {
  it("Rennwoche schlägt jede Phase, sonst bestimmt die Phase die Art", () => {
    expect(weekModeOf("base", false)).toBe("base");
    expect(weekModeOf("build", false)).toBe("main");
    expect(weekModeOf("peak", false)).toBe("main");
    expect(weekModeOf("taper", false)).toBe("taper");
    (["base", "build", "peak", "taper"] as CorePhase[]).forEach((phase) => expect(weekModeOf(phase, true)).toBe("race"));
  });
});

describe("slotsFor (§6)", () => {
  const MODES: Array<[WeekMode, CorePhase]> = [
    ["base", "base"],
    ["main", "build"],
    ["main", "peak"],
    ["taper", "taper"],
  ];

  it("so viele Slots wie Lauftage, genau ein Long Run (außer Rennwoche), Q-Zahl innerhalb von maxQ", () => {
    DISTANCES.forEach((distance) =>
      RUN_DAYS.forEach((runDays) =>
        [false, true].forEach((beginner) =>
          MODES.forEach(([mode, phase]) => {
            const slots = slotsFor({ distance, runDays, mode, phase, beginner });
            const label = `${distance}/${runDays}/${mode}/${phase}/${beginner}`;
            expect([label, slots.length]).toEqual([label, runDays]);
            expect([label, count(slots, "LR")]).toEqual([label, 1]);
            expect(slots.filter(isQ).length).toBeLessThanOrEqual(CONFIG.placement.maxQ.value[runDays]);
          }),
        ),
      ),
    );
  });

  it("Basis und Aufbau/Spezifisch entsprechen der Tabelle der Spec (HM, kein Einsteiger)", () => {
    RUN_DAYS.forEach((runDays) => {
      const row = CONFIG.weekTemplates.slots.value[runDays];
      const base = slotsFor({ distance: "hm", runDays, mode: "base", phase: "base", beginner: false });
      const main = slotsFor({ distance: "hm", runDays, mode: "main", phase: "build", beginner: false });
      expect(base).toEqual(row.base);
      expect(main).toEqual(row.main);
    });
  });

  it("Basis: 3 Tage ohne Q, 4 Tage mit leichter Q1, 5 und 6 Tage mit Q1; nie Q2", () => {
    const q = (runDays: RunDays) =>
      slotsFor({ distance: "hm", runDays, mode: "base", phase: "base", beginner: false }).filter(isQ);
    expect(q(3)).toEqual([]);
    expect(q(4)).toEqual(["Q1L"]);
    expect(q(5)).toEqual(["Q1"]);
    expect(q(6)).toEqual(["Q1"]);
  });

  it("Q2 bei 4 Lauftagen nur im Aufbau und nie im Einsteiger-Modus (Spec gilt, nicht der Umbauplan)", () => {
    const four = (phase: CorePhase, mode: WeekMode, beginner: boolean) =>
      slotsFor({ distance: "m", runDays: 4, mode, phase, beginner });
    expect(four("build", "main", false)).toContain("Q2");
    expect(four("peak", "main", false)).toContain("Q2");
    expect(four("base", "base", false)).not.toContain("Q2");
    expect(four("build", "main", true)).not.toContain("Q2");
    expect(four("peak", "main", true)).not.toContain("Q2");
    // Bei 5 und 6 Tagen bleibt Q2 auch für Einsteiger.
    expect(slotsFor({ distance: "m", runDays: 5, mode: "main", phase: "build", beginner: true })).toContain("Q2");
  });

  it("MLR nur bei 6 Tagen im Aufbau/Spezifisch und nur HM/M, sonst E (Review-Punkt 8: 5 Tage ohne MLR)", () => {
    DISTANCES.forEach((distance) =>
      RUN_DAYS.forEach((runDays) => {
        const main = slotsFor({ distance, runDays, mode: "main", phase: "build", beginner: false });
        const expectMlr = runDays === 6 && (distance === "hm" || distance === "m");
        expect([distance, runDays, main.indexOf("MLR") >= 0]).toEqual([distance, runDays, expectMlr]);
        expect(slotsFor({ distance, runDays, mode: "base", phase: "base", beginner: false })).not.toContain("MLR");
      }),
    );
  });

  it("Taper-Woche: wie Aufbau, aber genau ein Q, kein Q2, kein MLR, gleiche Lauftage", () => {
    DISTANCES.forEach((distance) =>
      RUN_DAYS.forEach((runDays) => {
        const taper = slotsFor({ distance, runDays, mode: "taper", phase: "taper", beginner: false });
        expect(taper).toHaveLength(runDays);
        expect(taper.filter(isQ)).toHaveLength(CONFIG.taper.qualitySessionsPerWeek.value);
        expect(taper).not.toContain("Q2");
        expect(taper).not.toContain("MLR");
        expect(count(taper, "LR")).toBe(1);
      }),
    );
  });

  it("Rennwoche: kein Long Run, ein Q1 plus E; mit dem Rennen Lauftage − 1, bei höchstens 3 Lauftagen alle Lauftage", () => {
    DISTANCES.forEach((distance) =>
      RUN_DAYS.forEach((runDays) => {
        const race = slotsFor({ distance, runDays, mode: "race", phase: "taper", beginner: false });
        expect(race).not.toContain("LR");
        expect(race[0]).toBe("Q1");
        expect(race.filter(isQ)).toHaveLength(1);
        // + 1 für das Rennen
        const expected = runDays <= CONFIG.raceWeek.fullRunDaysUpToRunDays.value ? runDays : runDays - CONFIG.taper.minRunDaysBelowRunDays.value;
        expect(race.length + 1).toBe(expected);
      }),
    );
  });
});
