// Backlog W3 (b): Coach schrieb „morgen beim langen Lauf warst du schon gefordert" — Zukunft und Vergangenheit
// vertauscht. Ursachen: (1) „heute" kam als UTC-Zeitstempel (todayIso) an; der Server (Vercel = UTC) machte daraus
// nachts den Vortag, die Einheit von gestern stand dann als „Nächste/heutige Einheit" im Kontext. (2) Der Kontext
// nannte weder den heutigen Tag noch einen Tagesbezug je Einheit, erledigte Workouts nur als Session-ID.
// Jetzt: todayYmd (lokaler Kalendertag des Geräts) hat Vorrang, jede Einheit trägt relativeDay/inDays/daysAgo,
// die Zusammenfassung nennt „Heute ist …" und erledigte Workouts mit Tagesbezug, der Prompt eine Zeitform-Regel.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coachHandlers-day-reference";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");

const weeks = [
  {
    wn: 1,
    phase: "Aufbau",
    km: 50,
    s: [
      { id: "w1-sa", day: "Sa", date: "14. Nov", dateIso: "2026-11-14", title: "Locker", km: 8, type: "easy" },
      { id: "w1-so", day: "So", date: "15. Nov", dateIso: "2026-11-15", title: "Long Run", km: 24, type: "long" },
    ],
  },
  {
    wn: 2,
    phase: "Aufbau",
    km: 52,
    s: [
      { id: "w2-mo", day: "Mo", date: "16. Nov", dateIso: "2026-11-16", title: "Ruhetag", km: 0, type: "rest" },
      { id: "w2-di", day: "Di", date: "17. Nov", dateIso: "2026-11-17", title: "Intervalle 6x1000 m", km: 12, type: "interval" },
    ],
  },
];

const context = (extra) => ({
  // Bewusst ein Zeitstempel vom Vortag (so kam er nachts in UTC an); todayYmd ist der echte Kalendertag.
  todayIso: "2026-11-15T12:00:00.000Z",
  raceDateIso: "2027-03-01",
  goals: { targetTime: "3:45:00" },
  trainingPlan: { source: "display", weeks },
  logsLast30Days: [{ sessionId: "w1-so", log: { done: true, rpe: 8 } }],
  recoveryDomain: { homeRecoveryScore0_100: 70 },
  ...extra,
});

async function send(ctx) {
  mockCreate.mockResolvedValue({ content: [{ text: "Alles klar." }] });
  await handleAiCoach({ input: "Wie war das Wochenende?", context: ctx });
  const system = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].system;
  return { staticPrompt: system[0].text, cached: JSON.parse(system[1].text), dynamic: system[2].text };
}

describe("Coach-Kontext: Tagesbezug (heute/morgen/gestern)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("todayYmd des Geräts schlägt den UTC-Zeitstempel: der Long Run von Sonntag ist gestern, nicht heute", async () => {
    const { cached, dynamic } = await send(context({ todayYmd: "2026-11-16" }));
    expect(cached.todayIso).toBe("2026-11-16");
    expect(cached.todayWeekday).toBe("Montag");
    expect(cached.trainingPlan.next14Days.map((s) => s.dateIso)).toEqual(["2026-11-16", "2026-11-17"]);
    const longRun = cached.trainingPlan.last7Days.find((s) => s.dateIso === "2026-11-15");
    expect(longRun).toMatchObject({ relativeDay: "gestern", daysAgo: 1 });
    expect(cached.trainingPlan.next14Days[1]).toMatchObject({ relativeDay: "morgen", inDays: 1 });
    expect(dynamic).toContain("Heute ist Montag, 2026-11-16");
    expect(dynamic).toContain("Nächste/heutige Einheit (morgen, Di 17. Nov): Intervalle 6x1000 m (12 km)");
    expect(dynamic).toContain("Letzte erledigte Workouts (Vergangenheit): Long Run 24 km (gestern, So 15. Nov)");
    expect(dynamic).not.toMatch(/morgen[^)]*Long Run/);
  });

  test("Prompt verlangt die richtige Zeitform", async () => {
    const { staticPrompt } = await send(context({ todayYmd: "2026-11-16" }));
    expect(staticPrompt).toContain("ZEITBEZUG");
    expect(staticPrompt).toContain("Vergangenheitsform");
  });

  test("Alter Client ohne todayYmd: weiter über todayIso (unverändert)", async () => {
    const { cached } = await send(context({}));
    expect(cached.todayIso).toBe("2026-11-15");
    expect(cached.trainingPlan.next14Days[0]).toMatchObject({ dateIso: "2026-11-15", relativeDay: "heute", inDays: 0 });
  });
});
