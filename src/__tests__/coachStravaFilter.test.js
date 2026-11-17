// Strava-Daten gehen an kein Sprachmodell (Strava API Policy §5.3): auch wenn ein älterer Client
// Strava-Läufe oder Session-Logs mit Strava-Werten schickt, erreichen sie Claude nicht.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coach-strava-filter";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");
const { isStravaSourcedCoachRun, stripStravaDerivedLogFields } = require("../../api/_lib/coachHealthRunFields");

const stravaRun = {
  runId: "strava:987654321",
  startDate: "2026-11-15T07:00:00.000Z",
  duration: 2777,
  distanceMeters: 9123,
  workoutType: "running",
  sourceName: "Strava",
  avgHeartRateBpm: 139,
};
const appleRun = {
  runId: "hk_UUID",
  startDate: "2026-11-14T07:00:00.000Z",
  duration: 3600,
  distanceMeters: 12000,
  workoutType: "running",
  sourceName: "Connect",
  avgHeartRateBpm: 148,
};

describe("isStravaSourcedCoachRun / stripStravaDerivedLogFields", () => {
  test("erkennt Strava nur am ID-Präfix strava:", () => {
    expect(isStravaSourcedCoachRun(stravaRun)).toBe(true);
    // Nur das ID-Präfix zählt: ein HealthKit-Workout, das die Strava-App nach Apple Health schreibt, ist Apple Health.
    expect(isStravaSourcedCoachRun({ ...stravaRun, runId: "hk_FROM-STRAVA-APP" })).toBe(false);
    expect(isStravaSourcedCoachRun({ ...stravaRun, runId: undefined })).toBe(false);
    expect(isStravaSourcedCoachRun(appleRun)).toBe(false);
    expect(isStravaSourcedCoachRun(null)).toBe(false);
  });

  test("beide Log-Formen", () => {
    const log = { done: true, rpe: 5, assignedRun: { runId: "strava:1", distanceKm: 9.1 }, runEvaluation: { feedback: "x" } };
    expect(stripStravaDerivedLogFields({ sessionId: "a", log })).toEqual({ sessionId: "a", log: { done: true, rpe: 5 } });
    expect(stripStravaDerivedLogFields({ sessionId: "a", ...log })).toEqual({ sessionId: "a", done: true, rpe: 5 });
    const apple = { sessionId: "b", log: { done: true, assignedRun: { runId: "hk_1", distanceKm: 12 } } };
    expect(stripStravaDerivedLogFields(apple)).toEqual(apple);
  });
});

describe("handleAiCoach — Strava-Daten im Claude-Request", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("Strava-Läufe und Strava-Werte aus Logs erreichen Claude nicht", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Alles gut." }], usage: {} });
    const { status } = await handleAiCoach({
      input: "Wie lief meine Woche?",
      context: {
        todayIso: "2026-11-16",
        recoveryDomain: { homeRecoveryScore0_100: 80 },
        healthRunsLast30Days: [stravaRun, appleRun],
        logsLast30Days: [
          {
            sessionId: "w2-sa",
            log: {
              done: true,
              actualKm: "9.12",
              durationMin: 46,
              assignedRun: { runId: "strava:987654321", distanceKm: 9.12, duration: 2777 },
              runEvaluation: { feedback: "ZZ-STRAVA-AUSWERTUNG" },
            },
          },
        ],
      },
    });
    expect(status).toBe(200);
    const request = JSON.stringify(mockCreate.mock.calls[0][0]);
    expect(request).toContain("2026-11-14T07:00:00.000Z");
    for (const forbidden of ["2026-11-15T07:00:00.000Z", "9123", "2777", "strava:", "ZZ-STRAVA-AUSWERTUNG", "9.12", "durationMin"]) {
      expect(request).not.toContain(forbidden);
    }
  });
});
