import { generateAiResponse } from "./generateAiResponse";
import type { AiContext } from "./types";

function createContext(): AiContext {
  return {
    todayIso: new Date(2026, 3, 6, 12, 0, 0).toISOString(),
    raceDateIso: new Date(2026, 8, 27, 12, 0, 0).toISOString(),
    goals: { targetTime: "2:49:50" },
    logs: {},
    plan: [
      {
        wn: 1,
        phase: "MINI",
        label: "W1",
        dates: "6.-12. Apr",
        km: 30,
        s: [{ id: "s1", day: "Mo", date: "6. Apr", type: "easy", title: "Easy", km: 8 }],
      },
    ],
    next14Days: [],
    availableScreens: [{ key: "settings", label: "Einstellungen" }],
    settings: {},
  };
}

describe("generateAiResponse provider routing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("falls back to mock when openai request fails", async () => {
    process.env.REACT_APP_AI_PROVIDER = "openai";
    process.env.REACT_APP_AI_ENABLED = "true";
    (global as any).fetch = jest.fn().mockRejectedValue(new Error("network down"));

    const response = await generateAiResponse("Ich bin krank", createContext());
    expect(response.action?.type).toBe("adjust_plan_for_illness");
    expect(response.message).toMatch(/lokaler Coach aktiv/i);
  });

  test("uses openai response when endpoint succeeds", async () => {
    process.env.REACT_APP_AI_PROVIDER = "openai";
    process.env.REACT_APP_AI_ENABLED = "true";
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: "navigator",
        message: "Ich oeffne die Einstellungen.",
        action: {
          type: "navigate_to_screen",
          payload: { targetScreen: "settings" },
        },
      }),
    });

    const response = await generateAiResponse("Oeffne die Einstellungen", createContext());
    expect(response.mode).toBe("navigator");
    expect(response.action?.type).toBe("navigate_to_screen");
  });
});
