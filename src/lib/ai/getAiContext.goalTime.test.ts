import type { AiPlanWeek } from "./types";
import { getAiContext, toRemoteCoachPayload } from "./getAiContext";
import { buildCoachRuntimeSnapshot } from "./coachRuntimeSnapshot";

const NOW = new Date("2026-11-17T08:00:00.000Z");

function planWithRace(km: number): AiPlanWeek[] {
  return [
    {
      wn: 1,
      phase: "build",
      label: "Woche 1",
      dates: "2026-12-14",
      km: 20,
      s: [{ id: "race", day: "So", date: "20. Dez", dateIso: "2026-12-20", type: "race", title: "Rennen", km }],
    },
  ];
}

const ctx = (plan: AiPlanWeek[], targetTime: string | undefined) =>
  getAiContext({ plan, logs: {}, targetTime, now: NOW, availableScreens: [] as never });

describe("Coach-Kontext: Zielzeit nur, wenn sie zur Plan-Distanz passt", () => {
  it("10-km-Plan + Marathon-Profilzeit 2:50:00 → keine Zielzeit an den Coach", () => {
    const context = ctx(planWithRace(10), "2:50:00");
    expect(context.goals.targetTime).toBeUndefined();
    expect(JSON.stringify(toRemoteCoachPayload(context))).not.toContain("2:50:00");
  });

  it("plausible Zielzeiten bleiben (10 km 0:48:00, Marathon 2:50:00)", () => {
    expect(ctx(planWithRace(10), "0:48:00").goals.targetTime).toBe("0:48:00");
    expect(ctx(planWithRace(42.195), "2:50:00").goals.targetTime).toBe("2:50:00");
  });

  it("Zielrennen ist das späteste Rennen (wie in der App): 10-km-Vorbereitungsrennen macht die Marathon-Zeit nicht unplausibel", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "build",
        label: "Woche 1",
        dates: "2026-11-23",
        km: 30,
        s: [{ id: "prep", day: "So", date: "29. Nov", dateIso: "2026-11-29", type: "race", title: "10-km-Testrennen", km: 10 }],
      },
      ...planWithRace(42.195),
    ];
    expect(ctx(plan, "2:50:00").goals.targetTime).toBe("2:50:00");
  });

  it("ohne Renndistanz, ohne Uhrzeit oder leer: unverändert", () => {
    expect(ctx([], "2:50:00").goals.targetTime).toBe("2:50:00");
    expect(ctx(planWithRace(10), "3:30").goals.targetTime).toBe("3:30");
    expect(ctx(planWithRace(10), "").goals.targetTime).toBe("");
    expect(ctx(planWithRace(10), undefined).goals.targetTime).toBeUndefined();
  });
});

describe("Coach-Snapshot: dieselbe Prüfung", () => {
  const snap = (plan: AiPlanWeek[], targetTime: string) =>
    buildCoachRuntimeSnapshot({
      now: NOW,
      platform: "web",
      plan,
      logs: {},
      healthRuns: [],
      preferences: { targetTime },
      raceDateIso: null,
      appleHealthConnected: false,
      healthKitAvailable: null,
    });

  it("10-km-Plan + 2:50:00 → keine Zielzeit; Marathon behält sie", () => {
    expect(snap(planWithRace(10), "2:50:00").preferences.targetTime).toBeUndefined();
    expect(snap(planWithRace(42.195), "2:50:00").preferences.targetTime).toBe("2:50:00");
  });
});
