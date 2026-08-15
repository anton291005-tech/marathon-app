// Regression test for the /api/ai fallback path in api/_lib/coachHandlers.js.
//
// Bug: a pure technical Claude failure (timeout/rate limit/network error) fell
// through fallbackStructuredResponse, which reran the same risk heuristic used
// for real coach replies (detectRiskProfile/hasFatigue, driven by the day's
// recoveryDomain score). On a low-recovery day this fabricated an
// adjust_plan_for_illness action regardless of what the user asked or of
// Claude ever answering. The fix splits the two paths: a technical failure
// now returns a plain message with `degraded: true` and no action, while the
// safety net keeps running on real (successfully parsed) Claude replies.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coachHandlers-fallback-spec";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");

// homeRecoveryScore0_100 < 40 → band 0 → detectRiskProfile treats this as a
// fatigue signal purely from context, independent of the user's message.
const lowRecoveryContext = () => ({
  todayIso: "2026-08-15",
  recoveryDomain: { homeRecoveryScore0_100: 20 },
});

describe("handleAiCoach — Claude fallback vs. real success path", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    // CRA's Jest config resets mocks between tests, which clears the
    // constructor's mockImplementation too — re-arm it every time.
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("(a) technical Claude failure on a low-recovery day: plain message, no action, degraded: true", async () => {
    mockCreate.mockRejectedValue(new Error("simulated rate limit"));

    const { status, body } = await handleAiCoach({
      input: "Wie sieht mein Plan diese Woche aus?",
      context: lowRecoveryContext(),
    });

    expect(status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.action).toBeNull();
    expect(body.message).toBe("Ich konnte gerade nicht antworten, versuch's nochmal.");
  });

  test("(b) real Claude success with a fatigue signal in context still triggers the illness safety net", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          text: JSON.stringify({ mode: "coach", message: "Heute locker halten." }),
        },
      ],
    });

    const { status, body } = await handleAiCoach({
      input: "Wie sieht mein Plan diese Woche aus?",
      context: lowRecoveryContext(),
    });

    expect(status).toBe(200);
    expect(body.degraded).toBeUndefined();
    expect(body.action).not.toBeNull();
    expect(body.action.type).toBe("adjust_plan_for_illness");
    expect(body.action.payload.reason).toBe("high_fatigue");
  });
});
