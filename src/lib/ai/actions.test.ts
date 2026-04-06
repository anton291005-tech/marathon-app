import { executeAiAction } from "./actions";
import type { AiContext, AiAssistantAction } from "./types";

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
        s: [
          { id: "s1", day: "Mo", date: "6. Apr", type: "easy", title: "Easy", km: 8 },
          { id: "s2", day: "Di", date: "7. Apr", type: "interval", title: "Intervalle", km: 12 },
          { id: "s3", day: "Mi", date: "8. Apr", type: "bike", title: "Bike", km: 0 },
        ],
      },
    ],
    next14Days: [],
    availableScreens: [{ key: "home", label: "Start" }],
    settings: {},
  };
}

describe("actions", () => {
  test("shift_plan_start_date creates conservative patches", () => {
    const action: AiAssistantAction = {
      type: "shift_plan_start_date",
      payload: { requestedStartOffsetDays: 4 },
    };
    const result = executeAiAction(action, createContext());
    expect(result.planPatches?.length).toBeGreaterThan(0);

    const firstSessionPatch = [...(result.planPatches || [])].reverse().find((patch) => patch.sessionId === "s1");
    expect(firstSessionPatch?.changes?.type).toBe("rest");

    const hardSessionPatch = [...(result.planPatches || [])].reverse().find((patch) => patch.sessionId === "s2");
    expect(hardSessionPatch?.changes?.type).toBe("easy");
  });
});
