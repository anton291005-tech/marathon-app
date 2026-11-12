import {
  HEALTH_SIGNAL_TYPES,
  HEALTH_SIGNAL_UNITS,
  MyRaceHealthSignals,
  healthSignalsWebFallback,
} from "./healthSignalsPlugin";
import { HEALTH_SIGNAL_TYPE_LABELS, listAppleHealthDataTypes } from "../features/settings/dataUsage";

describe("MyRaceHealthSignals (Web-Fallback)", () => {
  it("liefert ohne HealthKit überall ein leeres Ergebnis und wirft nie", async () => {
    await expect(MyRaceHealthSignals.requestAuthorization()).resolves.toMatchObject({ granted: false, requested: [] });
    await expect(
      MyRaceHealthSignals.readQuantitySamples({
        type: "heartRateVariabilityRMSSD",
        startDate: "2026-11-05T00:00:00Z",
        endDate: "2026-11-12T00:00:00Z",
        limit: 100,
      }),
    ).resolves.toEqual({ samples: [] });
    await expect(
      MyRaceHealthSignals.readWorkoutEffort({ workoutStart: "2026-11-11T06:00:00Z", workoutEnd: "2026-11-11T07:00:00Z" }),
    ).resolves.toEqual({});
  });

  it("availability meldet im Web jeden Typ als nicht vorhanden", async () => {
    const a = await MyRaceHealthSignals.availability();
    expect(a.healthDataAvailable).toBe(false);
    expect(Object.keys(a.types).sort()).toEqual([...HEALTH_SIGNAL_TYPES].sort());
    expect(Object.values(a.types).every((v) => v === false)).toBe(true);
  });

  it("der Fallback ist dieselbe Oberfläche wie das Plugin", () => {
    expect(Object.keys(healthSignalsWebFallback).sort()).toEqual(
      ["availability", "readQuantitySamples", "readWorkoutEffort", "requestAuthorization"],
    );
  });
});

describe("Typen, Einheiten und Labels", () => {
  it("jeder Native-Typ hat eine Einheit und ein eigenes Label auf der Datennutzungsseite", () => {
    expect(Object.keys(HEALTH_SIGNAL_UNITS).sort()).toEqual([...HEALTH_SIGNAL_TYPES].sort());
    expect(Object.keys(HEALTH_SIGNAL_TYPE_LABELS).sort()).toEqual([...HEALTH_SIGNAL_TYPES].sort());
    const labels = HEALTH_SIGNAL_TYPES.map((t) => HEALTH_SIGNAL_TYPE_LABELS[t]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l.trim()).not.toBe("");
  });

  it("die Datennutzungsliste enthält Native-Typen und oxygenSaturation (Blutsauerstoff)", () => {
    const all = listAppleHealthDataTypes();
    for (const t of HEALTH_SIGNAL_TYPES) expect(all).toContain(HEALTH_SIGNAL_TYPE_LABELS[t]);
    expect(all).toContain("Blutsauerstoff");
    expect(new Set(all).size).toBe(all.length);
  });
});
