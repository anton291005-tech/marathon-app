import {
  extractActivePaceSecPerKm,
  extractStructuredRunPaceSecPerKm,
  resolveSessionPaceSecPerKm,
} from "./intervalPaceExtraction";

describe("intervalPaceExtraction", () => {
  test("extractActivePaceSecPerKm ignores slow recovery laps", () => {
    // 4×1km @ 4:00/km (240s/km) + 3×1km recovery @ ~8:00/km (480s/km)
    const laps = [
      { distanceMeters: 1000, durationSeconds: 360 }, // WU slow
      { distanceMeters: 1000, durationSeconds: 240 },
      { distanceMeters: 1000, durationSeconds: 480 },
      { distanceMeters: 1000, durationSeconds: 240 },
      { distanceMeters: 1000, durationSeconds: 480 },
      { distanceMeters: 1000, durationSeconds: 240 },
      { distanceMeters: 1000, durationSeconds: 480 },
      { distanceMeters: 1000, durationSeconds: 240 },
      { distanceMeters: 1000, durationSeconds: 360 }, // CD slow
    ];
    const totalPace = 16 * 60; // 16 min/km blended — too slow
    const active = extractActivePaceSecPerKm(laps, totalPace);
    expect(active).not.toBeNull();
    expect(active!).toBeGreaterThan(230);
    expect(active!).toBeLessThan(250);
  });

  test("resolveSessionPaceSecPerKm falls back to total when no laps", () => {
    expect(
      resolveSessionPaceSecPerKm({
        sessionType: "interval",
        durationSec: 3600,
        distanceKm: 16,
        laps: null,
      }),
    ).toBe(225);
  });

  test("extractStructuredRunPaceSecPerKm trims slow warm/cool laps", () => {
    const laps = [
      { distance_meters: 2000, duration_seconds: 720 }, // 6:00/km WU
      { distance_meters: 2000, duration_seconds: 600 }, // 5:00/km
      { distance_meters: 2000, duration_seconds: 600 },
      { distance_meters: 2000, duration_seconds: 600 },
      { distance_meters: 2000, duration_seconds: 600 },
      { distance_meters: 2000, duration_seconds: 600 },
      { distance_meters: 2000, duration_seconds: 720 }, // CD
    ];
    const blended = (7 * 600 + 2 * 720) / 14; // ~ 622s / 14km — too slow vs 5:00 block
    const structured = extractStructuredRunPaceSecPerKm(laps, 12, 16, blended);
    expect(structured).not.toBeNull();
    expect(structured!).toBeLessThan(320);
  });
});
