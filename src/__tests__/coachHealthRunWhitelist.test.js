// Defense in depth: auch wenn ein Client ungefilterte Health-Workouts schickt, gehen an Claude
// nur Art, Start, Dauer, Distanz und Durchschnittspuls (api/_lib/coachHealthRunFields.js).

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coach-health-run-whitelist";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const { pickCoachHealthRunFields } = require("../../api/_lib/coachHealthRunFields");

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
};

describe("pickCoachHealthRunFields", () => {
  test("lässt nur die fünf erlaubten Felder durch", () => {
    expect(pickCoachHealthRunFields(fullRun)).toEqual({
      workoutType: "running",
      startDate: "2026-10-10T07:00:00.000Z",
      duration: 3600,
      distanceMeters: 12000,
      avgHeartRateBpm: 148,
    });
  });

  test("kein Objekt → null, fehlende Distanz → null statt erfundener Zahl", () => {
    expect(pickCoachHealthRunFields(null)).toBeNull();
    expect(pickCoachHealthRunFields("x")).toBeNull();
    expect(pickCoachHealthRunFields({ startDate: "2026-10-09T07:00:00.000Z", duration: 60 })).toEqual({
      startDate: "2026-10-09T07:00:00.000Z",
      duration: 60,
      distanceMeters: null,
    });
  });
});

describe("handleAiCoach — Health-Workouts im Claude-Request", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("ungefilterte Workouts vom Client erreichen Claude nur als Whitelist-Felder", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Alles gut." }], usage: {} });

    const { status } = await handleAiCoach({
      input: "Wie lief mein letzter Lauf?",
      context: {
        todayIso: "2026-10-12",
        recoveryDomain: { homeRecoveryScore0_100: 80 },
        healthRunsLast30Days: [fullRun],
      },
    });

    expect(status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const request = JSON.stringify(mockCreate.mock.calls[0][0]);
    expect(request).toContain("avgHeartRateBpm");
    expect(request).toContain("2026-10-10T07:00:00.000Z");
    for (const forbidden of ["gpsStream", "laps", "splits", "sourceName", "Apple Watch von Anton", "platformId", "HK-UUID-1", "run-1"]) {
      expect(request).not.toContain(forbidden);
    }
  });
});
