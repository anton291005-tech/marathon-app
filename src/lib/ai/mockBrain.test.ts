import { buildMockAiResponse } from "./mockBrain";
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
        s: [
          { id: "s1", day: "Mo", date: "6. Apr", type: "easy", title: "Easy", km: 8 },
          { id: "s2", day: "Di", date: "7. Apr", type: "bike", title: "Bike", km: 0 },
          { id: "s3", day: "Mi", date: "8. Apr", type: "interval", title: "Interval", km: 10 },
        ],
      },
    ],
    next14Days: [],
    availableScreens: [
      { key: "home", label: "Start" },
      { key: "week", label: "Wochenplan", sections: ["current_week"] },
      { key: "settings", label: "Einstellungen", sections: ["race_goal"] },
    ],
    settings: {},
  };
}

describe("mockBrain intent detection", () => {
  test("maps illness phrasing to adjust_plan_for_illness", () => {
    const response = buildMockAiResponse("Ich fuehle mich erkaeltet und nicht fit", createContext());
    expect(response.action?.type).toBe("adjust_plan_for_illness");
  });

  test("maps delayed start phrasing to shift_plan_start_date", () => {
    const response = buildMockAiResponse("Ich kann doch erst naechsten Donnerstag anfangen", createContext());
    expect(response.action?.type).toBe("shift_plan_start_date");
    expect(response.action?.payload?.requestedStartOffsetDays).toBeGreaterThanOrEqual(1);
  });

  test("maps race delay phrasing to shift_race_date", () => {
    const response = buildMockAiResponse("Der Wettkampf ist eine Woche spaeter", createContext());
    expect(response.action?.type).toBe("shift_race_date");
    expect(response.action?.payload?.shiftDays).toBe(7);
  });

  test("maps bike issue phrasing to replace_bike_with_run", () => {
    const response = buildMockAiResponse("Mein Rennrad ist in der Werkstatt", createContext());
    expect(response.action?.type).toBe("replace_bike_with_run");
  });

  test("maps navigation phrasing to navigate_to_screen", () => {
    const response = buildMockAiResponse("Bring mich zu den Einstellungen", createContext());
    expect(response.action?.type).toBe("navigate_to_screen");
    expect(response.action?.payload?.targetScreen).toBe("settings");
  });

  test("maps explanation phrasing to explain_feature", () => {
    const response = buildMockAiResponse("Was bedeutet Taper?", createContext());
    expect(response.action?.type).toBe("explain_feature");
  });

  test("returns clearly different risk-aware coaching responses", () => {
    const krank = buildMockAiResponse("ich bin krank", createContext());
    const knie = buildMockAiResponse("ich spuere einen stechenden schmerz im knie wenn ich laufen gehe", createContext());
    const muede = buildMockAiResponse("ich will heute intervalle laufen obwohl ich muede bin", createContext());

    expect(krank.action?.type).toBe("adjust_plan_for_illness");
    expect(krank.message.toLowerCase()).toMatch(/pause|krankheit/);

    expect(knie.action?.type).toBe("adjust_plan_for_illness");
    expect(knie.message.toLowerCase()).toMatch(/warnsignal|kein laufen|risiko/);

    expect(muede.action?.type).toBe("adjust_plan_for_illness");
    expect(muede.message.toLowerCase()).toMatch(/keine intervalle|muedigkeit|falsche entscheidung/);

    expect(new Set([krank.message, knie.message, muede.message]).size).toBe(3);
  });
});
