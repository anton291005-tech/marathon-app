import { analyzeIntensity } from "./analyzeIntensity";

describe("ai/analysis analyzeIntensity (Level 2)", () => {
  test("interval detected but no extractable segments → HR-based interval branch (never full-session pace)", () => {
    const res = analyzeIntensity({
      durationMinutes: 55,
      sessionType: "interval",
      sessionTitle: "5×2000m Intervalle",
      planDescription: "5×2000m @ 4:10/km",
      laps: [{ durationSeconds: 60, distanceMeters: 400 }],
      gpsStream: null,
      splits: null,
      actualHrBpm: 168,
      expectedHrBpm: 160,
      actualPaceSecPerKm: 308,
      plannedPaceSecPerKm: { min: 250, max: 260 },
    });
    expect(res).not.toBeNull();
    expect(res?.model).toBe("interval");
    expect(res?.signalSource).toBe("hr");
    expect(typeof res?.intensityScore).toBe("number");
  });

  test("interval detected, no segments, no HR → interval insufficient_data (never pace_only)", () => {
    const res = analyzeIntensity({
      durationMinutes: 55,
      sessionType: "interval",
      sessionTitle: "5×2000m Intervalle",
      planDescription: "5×2000m @ 4:10/km",
      laps: [{ durationSeconds: 60, distanceMeters: 400 }],
      gpsStream: null,
      splits: null,
      actualHrBpm: null,
      expectedHrBpm: null,
      actualPaceSecPerKm: 308,
      plannedPaceSecPerKm: { min: 250, max: 260 },
    });
    expect(res?.model).toBe("interval");
    expect(res?.signalSource).toBe("insufficient_data");
  });
  test("classification boundaries are correct (0.84/0.85/1.15/1.35)", () => {
    const base = {
      durationMinutes: 60,
      actualHrBpm: 100,
      expectedHrBpm: 100,
      actualPaceSecPerKm: null,
      plannedPaceSecPerKm: null,
    };

    expect(analyzeIntensity({ ...base, actualHrBpm: 84, expectedHrBpm: 100 })?.classification).toBe("too_easy"); // 0.84
    expect(analyzeIntensity({ ...base, actualHrBpm: 85, expectedHrBpm: 100 })?.classification).toBe("on_target"); // 0.85
    expect(analyzeIntensity({ ...base, actualHrBpm: 115, expectedHrBpm: 100 })?.classification).toBe("on_target"); // 1.15
    expect(analyzeIntensity({ ...base, actualHrBpm: 116, expectedHrBpm: 100 })?.classification).toBe("too_hard"); // 1.16
    expect(analyzeIntensity({ ...base, actualHrBpm: 135, expectedHrBpm: 100 })?.classification).toBe("too_hard"); // 1.35
    expect(analyzeIntensity({ ...base, actualHrBpm: 136, expectedHrBpm: 100 })?.classification).toBe("overreaching"); // >1.35
  });

  test("missing HR falls back to pace-only (deterministic)", () => {
    const res = analyzeIntensity({
      durationMinutes: 50,
      actualHrBpm: null,
      expectedHrBpm: null,
      actualPaceSecPerKm: 300, // 5:00/km
      plannedPaceSecPerKm: { min: 310, max: 330 }, // 5:10..5:30
    });
    expect(res?.model).toBe("pace_only");
    expect(res?.signalSource).toBe("pace_only");
    expect((res?.confidence ?? 0)).toBeLessThanOrEqual(0.6);
    expect(res?.level).toBe(2);
    expect(typeof res?.intensityScore).toBe("number");
    expect(typeof res?.effortRatio).toBe("number");
  });

  test("zero expected HR => null (skip, no crash)", () => {
    const res = analyzeIntensity({
      durationMinutes: 45,
      actualHrBpm: 150,
      expectedHrBpm: 0,
      actualPaceSecPerKm: null,
      plannedPaceSecPerKm: null,
    });
    expect(res).toBeNull();
  });

  test("deterministic output for identical input", () => {
    const args = {
      durationMinutes: 60,
      actualHrBpm: 150,
      expectedHrBpm: 140,
      actualPaceSecPerKm: 330,
      plannedPaceSecPerKm: { min: 320, max: 340 },
    };
    const a = analyzeIntensity(args);
    const b = analyzeIntensity(args);
    expect(a).toEqual(b);
  });

  test("pace-only confidence is always lower than HR-based confidence", () => {
    const hr = analyzeIntensity({
      durationMinutes: 60,
      actualHrBpm: 150,
      expectedHrBpm: 140,
      actualPaceSecPerKm: null,
      plannedPaceSecPerKm: null,
    });
    const pace = analyzeIntensity({
      durationMinutes: 60,
      actualHrBpm: null,
      expectedHrBpm: null,
      actualPaceSecPerKm: 300,
      plannedPaceSecPerKm: { min: 310, max: 330 },
    });
    expect(hr?.signalSource).toBe("hr");
    expect((hr?.confidence ?? 0)).toBeGreaterThanOrEqual(0.8);
    expect(pace?.signalSource).toBe("pace_only");
    expect((pace?.confidence ?? 0)).toBeLessThanOrEqual(0.6);
    expect((pace?.confidence ?? 1)).toBeLessThan((hr?.confidence ?? 0));
  });
});

