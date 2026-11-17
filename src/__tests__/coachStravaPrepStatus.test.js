// Strava API Policy §5.3: ein unbestätigter Zielzeit-Vorschlag aus dem Strava-Import erreicht Claude nicht,
// auch wenn ein älterer Client ihn mit Herkunft im prepStatus mitschickt.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coach-strava-prep";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");

const prepStatus = (result) => ({
  status: "completed",
  completedBy: "race_done",
  raceYmd: "2026-09-27",
  raceName: "Warschau Marathon",
  raceRun: true,
  result: {
    finishTime: "3:11:15",
    finishTimeSeconds: 11475,
    finishTimeConfirmed: false,
    pacePerKm: "4:32 /km",
    distanceKm: 42.195,
    ...result,
  },
  focus: "recovery",
});

async function sentPrep(result) {
  mockCreate.mockResolvedValue({ content: [{ type: "text", text: "Gut." }], usage: {} });
  await handleAiCoach({
    input: "Wie war mein Rennen?",
    context: { todayIso: "2026-09-29", recoveryDomain: {}, prepStatus: prepStatus(result) },
  });
  return JSON.parse(mockCreate.mock.calls[0][0].system[1].text).prepStatus;
}

describe("handleAiCoach — Zielzeit-Vorschlag aus Strava (prepStatus)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("unbestätigte Zeit mit Herkunft Strava → keine Zeit, keine Pace", async () => {
    const sent = await sentPrep({ finishTimeOrigin: "strava" });
    expect(sent.result).toMatchObject({ finishTime: null, finishTimeSeconds: null, pacePerKm: null, finishTimeConfirmed: false });
    // Abgehaktes Rennen bleibt „gelaufen“.
    expect(sent.raceRun).toBe(true);
  });

  test("bestätigte Zeit (Angabe des Athleten) bleibt, auch wenn der Vorschlag aus Strava kam", async () => {
    const sent = await sentPrep({ finishTimeOrigin: "strava", finishTimeConfirmed: true });
    expect(sent.result).toMatchObject({ finishTimeSeconds: 11475, finishTime: "3:11:15" });
  });

  test("Apple-Health-Vorschlag unverändert", async () => {
    const sent = await sentPrep({});
    expect(sent.result).toMatchObject({ finishTimeSeconds: 11475, finishTimeConfirmed: false });
  });
});
