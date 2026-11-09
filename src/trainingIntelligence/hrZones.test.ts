import type { CoreKind } from "../planCore";
import { HR_ZONE_PCT_BANDS, getHrRangeForZone, plannedHrRangeForSessionType, zoneLabelForSession, zoneLabelForSessionType } from "./hrZones";
import { getPostWorkoutPlannedHr, getSessionHrZoneShort, getSessionTargetLines, hrZoneMidBpm } from "./sessionPlanTargets";

const TYPES = ["easy", "long", "tempo", "interval", "race", "bike", "strength", "rest", "swim", "", "unknown"];

describe("zoneLabelForSession ohne kind = zoneLabelForSessionType", () => {
  it.each(TYPES.flatMap((t) => [[t, false], [t, true]] as const))("%s (Entlastung: %s)", (type, recovery) => {
    expect(zoneLabelForSession(type, undefined, recovery)).toBe(zoneLabelForSessionType(type, recovery));
    expect(zoneLabelForSession(type, null, recovery)).toBe(zoneLabelForSessionType(type, recovery));
  });

  it("Aufrufer ohne kind liefern wie vorher", () => {
    for (const type of TYPES) {
      for (const week of [undefined, { isRecoveryWeek: true } as never]) {
        const session = { type } as never;
        expect(getSessionHrZoneShort(session, week)).toBe(
          type === "rest" || type === "strength" ? null : zoneLabelForSessionType(type, type === "easy" && !!week),
        );
        expect(getSessionTargetLines(session, 190, week)).toEqual(getSessionTargetLines({ type } as never, 190, week));
      }
      expect(plannedHrRangeForSessionType(type, 190)).toEqual(
        getHrRangeForZone(zoneLabelForSessionType(type), 190),
      );
    }
  });
});

describe("Zone nach kind", () => {
  const cases: Array<[CoreKind, string, string | null, boolean, string | null]> = [
    ["REC", "easy", null, false, "Zone 1"],
    ["REC", "easy", null, true, "Zone 1"],
    ["E", "easy", null, false, "Zone 2"],
    ["E", "easy", null, true, "Zone 1"],
    ["MLR", "easy", null, false, "Zone 2"],
    ["MLR", "easy", null, true, "Zone 2"],
    ["LR", "long", null, false, "Zone 2"],
    ["LR+M", "long", null, false, "Zone 2"],
    ["M", "tempo", null, false, "Zone 3"],
    ["T", "tempo", null, false, "Zone 4"],
    ["I", "interval", null, false, "Zone 4–5"],
    ["R", "interval", null, false, "Zone 4–5"],
    ["RACE", "race", null, false, "Zone 4–5"],
    ["REST", "rest", null, false, null],
  ];
  it.each(cases)("%s (%s, Entlastung: %s*) → %s", (kind, type, _n, recovery, zone) => {
    expect(zoneLabelForSession(type, kind, recovery)).toBe(zone);
  });

  it("zeigt Zone und Band in der Pulszeile (REC, M, T)", () => {
    const line = (type: string, kind: CoreKind) => getSessionTargetLines({ type, kind } as never, 200)?.pulseLabel;
    expect(line("easy", "REC")).toBe("Herzfrequenzbereich: Zone 1 (100–120 bpm, 50–60% HFmax)");
    expect(line("tempo", "M")).toBe("Herzfrequenzbereich: Zone 3 (152–164 bpm, 76–82% HFmax)");
    expect(line("tempo", "T")).toBe("Herzfrequenzbereich: Zone 4 (164–176 bpm, 82–88% HFmax)");
    expect(line("tempo", undefined as never)).toContain("Zone 3–4");
  });

  it("Karte, Kurzform, Mittelwert und Auswertung nutzen dieselbe Zone", () => {
    const m = { type: "tempo", kind: "M" } as never;
    expect(getSessionHrZoneShort(m)).toBe("Zone 3");
    expect(hrZoneMidBpm(m, 200)).toBe(Math.round(((0.76 + 0.82) / 2) * 200));
    expect(getPostWorkoutPlannedHr(m, 200)).toEqual({ hrBpm: { min: 152, max: 164 }, hrZoneLabel: "Zone 3" });
    expect(plannedHrRangeForSessionType("tempo", 200, "T")).toEqual({ min: 164, max: 176 });
    expect(plannedHrRangeForSessionType("tempo", 200)).toEqual({ min: 152, max: 176 });
  });

  it("kind, das nicht zum Typ passt (veraltet nach einem Patch), wird ignoriert", () => {
    expect(zoneLabelForSession("easy", "T")).toBe("Zone 2");
    expect(zoneLabelForSession("easy", "M")).toBe("Zone 2");
    expect(zoneLabelForSession("easy", "T", true)).toBe("Zone 1");
    expect(zoneLabelForSession("tempo", "REC")).toBe("Zone 3–4");
    expect(zoneLabelForSession("long", "I")).toBe("Zone 2");
    expect(zoneLabelForSession("tempo", "M")).toBe("Zone 3");
  });

  it("Zone 3 und Zone 4 teilen das Band Zone 3–4", () => {
    expect(HR_ZONE_PCT_BANDS["Zone 3"].lo).toBe(HR_ZONE_PCT_BANDS["Zone 3–4"].lo);
    expect(HR_ZONE_PCT_BANDS["Zone 3"].hi).toBe(HR_ZONE_PCT_BANDS["Zone 4"].lo);
    expect(HR_ZONE_PCT_BANDS["Zone 4"].hi).toBe(HR_ZONE_PCT_BANDS["Zone 3–4"].hi);
  });
});
