import type { StoredHealthRun } from "../../healthRuns";
import { toCoachHealthRun, toRemoteCoachPayload } from "./getAiContext";
import type { AiContext } from "./types";

const fullRun = {
  runId: "run-1",
  platformId: "HK-UUID-1",
  startDate: "2026-10-10T07:00:00.000Z",
  duration: 3600,
  distanceMeters: 12000,
  distanceUnknown: false,
  workoutType: "running",
  sourceName: "Apple Watch von Anton",
  avgHeartRateBpm: 148,
  splits: [{ km: 1, sec: 300 }],
  laps: [{ index: 0, durationSec: 300, distanceMeters: 1000 }],
  gpsStream: [{ lat: 52.5, lon: 13.4 }],
  intervalIntensitySnapshot: { score: 80 },
} as unknown as StoredHealthRun;

const ALLOWED_KEYS = ["avgHeartRateBpm", "distanceMeters", "duration", "startDate", "workoutType"];

describe("Coach-Payload: Whitelist für Health-Workouts", () => {
  test("toCoachHealthRun lässt nur Art, Start, Dauer, Distanz und Durchschnittspuls durch", () => {
    expect(toCoachHealthRun(fullRun)).toEqual({
      workoutType: "running",
      startDate: "2026-10-10T07:00:00.000Z",
      duration: 3600,
      distanceMeters: 12000,
      avgHeartRateBpm: 148,
    });
  });

  test("fehlende optionale Felder werden nicht erfunden", () => {
    const bare = { runId: "r", startDate: "2026-10-09T07:00:00.000Z", duration: 100, distanceMeters: null, distanceUnknown: true };
    expect(toCoachHealthRun(bare as StoredHealthRun)).toEqual({
      startDate: "2026-10-09T07:00:00.000Z",
      duration: 100,
      distanceMeters: null,
    });
  });

  test("im gesendeten Payload stehen weder GPS, Runden, Splits, Quellname noch IDs", () => {
    const context = { todayIso: "2026-10-12T08:00:00.000Z", plan: [], logs: {}, healthRuns: [fullRun] } as unknown as AiContext;
    const payload = toRemoteCoachPayload(context);
    expect(payload.healthRunsLast30Days).toHaveLength(1);
    expect(Object.keys(payload.healthRunsLast30Days[0]).sort()).toEqual(ALLOWED_KEYS);
    const sent = JSON.stringify(payload);
    for (const forbidden of ["gpsStream", "laps", "splits", "sourceName", "Apple Watch von Anton", "platformId", "HK-UUID-1", "runId", "intervalIntensitySnapshot"]) {
      expect(sent).not.toContain(forbidden);
    }
  });
});
