// Pinnt Phasennamen und Zonen zwischen Server (api/_lib) und Client (src), gegen einen gemeinsamen Vektor:
//   Phasenname:  api/_lib/deterministicPlanGenerator.js  PHASE_LABEL_DE   ↔  src/planV2/trainingPhase.ts
//   Zone/Typ:    api/_lib/planSessionText.js            zoneForSession   ↔  src/trainingIntelligence/hrZones.ts
// Und: jede Pulsangabe im Client (Karte, Auswertung, Plan-Treue) kommt aus der einen Tabelle in hrZones.ts.

const vectors = require("../planV2/__fixtures__/planLabelVectors.json");
const server = {
  ...require("../../api/_lib/deterministicPlanGenerator"),
  ...require("../../api/_lib/planSessionText"),
};
const { trainingPhaseLabelDe } = require("../planV2/trainingPhase");
const hr = require("../trainingIntelligence/hrZones");
const targets = require("../trainingIntelligence/sessionPlanTargets");
const { formatPlannedHrZoneDisplay } = require("../trainingIntelligence/zoneBpmDisplay");
const { computePlanAdherenceScore } = require("../utils/planAdherenceScore");

describe("Phasenname: ein Name pro Phase, Server = Client", () => {
  it.each(Object.entries(vectors.phaseLabels))("%s → %s", (phase, label) => {
    expect(trainingPhaseLabelDe(phase)).toBe(label);
    expect(server.PHASE_LABEL_DE[phase]).toBe(label);
    expect(server.trainingPhaseLabelDe(phase)).toBe(label);
  });

  it("Wochenlabel trägt genau den Phasennamen", () => {
    expect(server.weekLabelFor(3, "build")).toBe("Woche 3 · Aufbau");
  });
});

describe("Zone je Einheitentyp: Server = Client", () => {
  it.each(vectors.zones.map((z) => [`${z.type}${z.recovery ? " (Entlastung)" : ""}`, z]))("%s", (_n, z) => {
    expect(hr.zoneLabelForSessionType(z.type, z.recovery)).toBe(z.zone);
    expect(server.zoneForSession(z.type, z.recovery) ?? null).toBe(z.zone);
    if (z.type !== "rest" && z.type !== "strength" && z.type !== "bike") {
      const week = z.recovery ? { focus: server.RECOVERY_WEEK_FOCUS } : undefined;
      expect(targets.getSessionHrZoneShort({ type: z.type }, week)).toBe(z.zone);
    }
  });
});

describe("Eine Puls-Quelle", () => {
  it("Bänder entsprechen dem gemeinsamen Vektor", () => {
    for (const [zone, [lo, hi]] of Object.entries(vectors.pulseBands)) {
      expect(hr.HR_ZONE_PCT_BANDS[zone]).toEqual({ lo, hi });
    }
  });

  it("Karte, Auswertung und Detail liefern für HFmax 200 dieselbe Spanne wie die Tabelle", () => {
    expect(hr.getHrRangeForZone("Zone 2", 200)).toEqual({ min: 120, max: 150 });
    for (const type of ["easy", "long", "tempo", "interval", "race", "bike"]) {
      const fromTable = hr.getHrRangeForZone(hr.zoneLabelForSessionType(type), 200);
      expect(targets.plannedHrRangeForSessionType(type, 200)).toEqual(fromTable);
      const line = targets.getSessionTargetLines({ type }, 200)?.pulseLabel;
      expect(line).toContain(`${fromTable.min}–${fromTable.max} bpm`);
      expect(line).toContain(hr.zoneLabelForSessionType(type));
    }
  });

  it("ohne Max-HF nur die Zone, keine erfundene bpm-Spanne", () => {
    expect(formatPlannedHrZoneDisplay("Zone 2", null)).toBe("Zone 2");
    expect(formatPlannedHrZoneDisplay("Zone 2", { min: 120, max: 150 })).toBe("120–150 bpm");
    expect(targets.plannedHrRangeForSessionType("easy", null)).toBeNull();
    expect(targets.plannedHrRangeForSessionType("easy", 60)).toBeNull();
  });

  it("Plan-Treue ohne Max-HF rechnet mit der Zone-2-Spanne der Tabelle (120–150 bei 200)", () => {
    const inRange = computePlanAdherenceScore({ sessionType: "bike", sport: "bike", actualHrBpm: 135 });
    const outOfRange = computePlanAdherenceScore({ sessionType: "bike", sport: "bike", actualHrBpm: 185 });
    expect(inRange.components.hrAccuracy).toBeGreaterThan(outOfRange.components.hrAccuracy);
  });
});
