import {
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
});
