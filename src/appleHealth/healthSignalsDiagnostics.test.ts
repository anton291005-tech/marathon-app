import {
  describeDevice,
  formatHealthSignalsReport,
  summarizeSamples,
  type HealthSignalsDiagnostics,
} from "./healthSignalsDiagnostics";

describe("Geräte-Diagnose", () => {
  it("summarizeSamples zählt je Kalendertag und behält drei Beispiele", () => {
    const mk = (iso: string, value: number) => ({ value, startDate: iso, sourceName: "Apple Watch" });
    const s = summarizeSamples("HRV RMSSD", "ms", [
      mk("2026-11-10T02:10:00", 41),
      mk("2026-11-10T03:20:00", 44),
      mk("2026-11-11T02:30:00", 39),
      mk("2026-11-11T04:00:00", 52),
    ]);
    expect(s.count).toBe(4);
    expect(s.perDay).toEqual({ "2026-11-10": 2, "2026-11-11": 2 });
    expect(s.examples).toHaveLength(3);
  });

  it("der Bericht nennt Typen, Fehler und Anstrengung je Training", () => {
    const d: HealthSignalsDiagnostics = {
      generatedAt: "2026-11-12T08:00:00.000Z",
      availability: {
        healthDataAvailable: true,
        systemVersion: "27.0",
        types: {
          heartRateVariabilityRMSSD: true,
          workoutEffortScore: true,
          estimatedWorkoutEffortScore: true,
          appleSleepingWristTemperature: true,
          heartRateRecoveryOneMinute: true,
          vo2Max: true,
        },
      },
      authorization: { granted: true, requested: ["vo2Max"] },
      signals: [
        { ...summarizeSamples("HRV RMSSD", "ms", []), error: "boom" },
        summarizeSamples("VO2max", "mL/(kg·min)", [{ value: 47.2, startDate: "2026-11-11T08:00:00", sourceName: "Apple Watch" }]),
      ],
      workouts: [
        { type: "running", startDate: "2026-11-11T06:00:00.000Z", durationMin: 52, effort: { userScore: 6, method: { user: "related" } } },
        { type: "cycling", startDate: "2026-11-10T06:00:00.000Z", durationMin: 60, effort: null },
      ],
    };
    const text = formatHealthSignalsReport(d);
    expect(text).toContain("HRV RMSSD [ms]: 0 Werte – FEHLER boom");
    expect(text).toContain("VO2max [mL/(kg·min)]: 1 Werte");
    expect(text).toContain("selbst=6(related) geschätzt=–");
    expect(text).toContain("kein Wert");
    expect(text).toContain("iOS 27.0");
  });

  it("Bericht: Freigabe je Typ trennt „nie angefragt“ von „angefragt“, nennt Geräte und native Trainings", () => {
    const d: HealthSignalsDiagnostics = {
      generatedAt: "2026-11-14T08:00:00.000Z",
      availability: null,
      authorization: { granted: true, requested: [] },
      signals: [
        summarizeSamples("HRV SDNN (bestehendes Plugin)", "ms", [], "heartRateVariabilitySDNN"),
        summarizeSamples("VO2max", "mL/(kg·min)", [
          { value: 47.2, startDate: "2026-11-07T08:00:00", sourceName: "Apple Watch", deviceModel: "Watch", hardwareVersion: "Watch6,18" },
        ], "vo2Max"),
      ],
      workouts: [],
      typeStatus: {
        heartRateVariabilitySDNN: { available: true, request: "shouldRequest", sharing: "notDetermined" },
        vo2Max: { available: true, request: "unnecessary", sharing: "sharingDenied" },
        workout: { available: true, request: "unnecessary", sharing: "sharingDenied" },
        heartRateVariabilityRMSSD: { available: false },
      },
      nativeWorkouts: [
        { activityType: 37, startDate: "2026-11-07T07:10:00.000Z", endDate: "2026-11-07T08:02:00.000Z", durationMin: 52, sourceName: "Apple Watch", distanceKm: 10.4, deviceModel: "Watch", hardwareVersion: "Watch6,18" },
      ],
      devices: ["Watch · Watch6,18 · Apple Watch"],
    };
    const text = formatHealthSignalsReport(d);
    expect(text).toContain("HRV SDNN (bestehendes Plugin) [ms]: 0 Werte {NIE ANGEFRAGT}");
    expect(text).toContain("VO2max [mL/(kg·min)]: 1 Werte {angefragt}");
    expect(text).toContain("Watch Watch6,18");
    expect(text).toContain("Geräte: Watch · Watch6,18 · Apple Watch");
    expect(text).toContain("heartRateVariabilityRMSSD: auf diesem OS nicht vorhanden");
    expect(text).toContain("Trainings laut bestehendem Plugin (0) {angefragt}");
    expect(text).toContain("Trainings direkt aus HealthKit (1):");
    expect(text).toContain("Typ 37  52 min  10.4 km  Apple Watch / Watch Watch6,18");
  });

  it("describeDevice: nur vorhandene Teile", () => {
    expect(describeDevice({ deviceModel: "Watch", hardwareVersion: "Watch6,18" })).toBe("Watch · Watch6,18");
    expect(describeDevice({})).toBeNull();
  });
});
