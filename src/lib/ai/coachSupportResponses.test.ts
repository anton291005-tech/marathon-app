import { trySupportCoachResponse } from "./coachSupportResponses";
import type { AiContext } from "./types";

function minimalContext(overrides: Partial<AiContext> = {}): AiContext {
  const base: AiContext = {
    todayIso: new Date(2026, 4, 3).toISOString(),
    raceDateIso: null,
    goals: { targetTime: "3:30:00" },
    plan: [{ wn: 1, phase: "BASE", label: "W1", dates: "", km: 0, s: [] }],
    logs: { a: { done: true } },
    next14Days: [],
    availableScreens: [{ key: "settings", label: "Einstellungen" }],
    recoveryDomain: {} as any,
    recoverySummary: { avgConfidence: 0.7 } as any,
    coachSnapshot: {
      knowledgeVersion: "t",
      platform: "ios",
      preferences: { targetTime: "3:30:00", maxHeartRateBpm: 180 },
      appleHealth: { connected: false, kitAvailable: true },
      planSummary: { weeks: 1, sessionsTotal: 1, raceDateIso: null, nextSessions: [] },
      adherence: { score: 70, band: "ok", confidence: 0.6 },
      last30Days: {
        completedPlanSessions: 3,
        healthRunsAll: 4,
        healthRunsRunning: 2,
        healthRunningKmRounded: 42.5,
        windowLabel: "",
      },
      localStorageKeysHint: ["marathonLogs"],
    },
    maxHeartRateBpm: 180,
  };
  return { ...base, ...overrides };
}

describe("trySupportCoachResponse", () => {
  it("returns monthly km framing with user's snapshot", () => {
    const r = trySupportCoachResponse(
      "Wie viele km habe ich im letzten Monat gelaufen?",
      minimalContext(),
    );
    expect(r?.mode).toBe("support");
    expect(r?.message).toMatch(/42(,|.)?5.*km/i);
    expect(r?.message).toMatch(/30/);
    expect(r?.action?.type).toBe("navigate_to_screen");
  });

  it("offers prefs reset card for profile reset wording", () => {
    const r = trySupportCoachResponse("Bitte Profil zurücksetzen", minimalContext());
    expect(r?.action?.type).toBe("update_user_preferences");
    expect(r?.action?.payload?.resetProfile).toBe(true);
  });

  it("does not intercept swap intent", () => {
    expect(trySupportCoachResponse("Tausche Dienstag und Donnerstag nächste Woche", minimalContext())).toBeNull();
  });
});
