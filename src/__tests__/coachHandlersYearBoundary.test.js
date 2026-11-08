// Regression Stufe B (Server-Coach-Kontext): Plan Sa 07.11.2026 → So 28.02.2027. Der Server las jedes Label
// ("29. Dez") mit dem Jahr von „heute": am 02.01.2027 wurden Dezember-Sessions zu Dez 2027 (Zukunft), die
// letzten 7 Tage fehlten, und an Silvester-Vorabenden lagen die Januar-Sessions in der „Vergangenheit".
// `dateIso` trägt das echte Jahr und wird jetzt zuerst gelesen und an den Coach weitergereicht.

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coachHandlers-year-boundary";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function buildWeeks({ withDateIso = true } = {}) {
  const weeks = [];
  const cursor = new Date(Date.UTC(2026, 10, 7));
  const end = Date.UTC(2027, 1, 28);
  let wn = 1;
  while (cursor.getTime() <= end) {
    const s = [];
    for (let i = 0; i < 7 && cursor.getTime() <= end; i += 1) {
      const ymd = cursor.toISOString().slice(0, 10);
      s.push({
        id: `s-${ymd}`,
        day: DAYS[cursor.getUTCDay()],
        date: `${cursor.getUTCDate()}. ${MONTHS[cursor.getUTCMonth()]}`,
        ...(withDateIso ? { dateIso: ymd } : {}),
        title: `Lauf ${ymd}`,
        km: 8,
        type: "easy",
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push({ wn, phase: wn <= 10 ? "Aufbau" : "Spezifisch", km: 56, s });
    wn += 1;
  }
  return weeks;
}

const baseContext = (todayIso, weeks) => ({
  todayIso,
  raceDateIso: "2027-02-28T12:00:00.000Z",
  goals: { targetTime: "3:59:00" },
  trainingPlan: { source: "display", weeks },
  recoveryDomain: { homeRecoveryScore0_100: 80 },
});

async function sentContext(context) {
  mockCreate.mockResolvedValue({ content: [{ text: "Alles klar." }] });
  await handleAiCoach({ input: "Wie geht es weiter?", context });
  const system = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].system;
  return { cached: JSON.parse(system[1].text), dynamic: system[2].text };
}

describe("Coach-Kontext (Server) über den Jahreswechsel", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("02.01.2027: last7Days sind 26.12.–01.01., next14Days 02.01.–16.01. (jeweils mit echtem dateIso)", async () => {
    const { cached } = await sentContext(baseContext("2027-01-02T12:00:00.000Z", buildWeeks()));
    const last7 = cached.trainingPlan.last7Days.map((s) => s.dateIso);
    const next14 = cached.trainingPlan.next14Days.map((s) => s.dateIso);
    expect(last7[0]).toBe("2026-12-26");
    expect(last7[last7.length - 1]).toBe("2027-01-01");
    expect(last7).toHaveLength(7);
    expect(next14[0]).toBe("2027-01-02");
    expect(next14[next14.length - 1]).toBe("2027-01-16");
  });

  test("28.12.2026: next14Days laufen über Neujahr (Januar-Sessions sind Zukunft, nicht 2026-Vergangenheit)", async () => {
    const { cached, dynamic } = await sentContext(baseContext("2026-12-28T12:00:00.000Z", buildWeeks()));
    const next14 = cached.trainingPlan.next14Days.map((s) => s.dateIso);
    expect(next14[0]).toBe("2026-12-28");
    expect(next14).toContain("2027-01-05");
    expect(next14[next14.length - 1]).toBe("2027-01-11");
    expect(dynamic).toContain("Lauf 2026-12-28");
  });

  test("Aktuelle Woche und Ø-Wochenkilometer am 02.01.2027 kommen aus dem richtigen Jahr", async () => {
    const { cached } = await sentContext(baseContext("2027-01-02T12:00:00.000Z", buildWeeks()));
    // Woche 9 (02.01.–08.01.2027) ist noch „Aufbau"; ab Woche 11 „Spezifisch".
    expect(cached.trainingPlan.planSummary.currentPhase).toBe("Aufbau");
    // Restwochen ab 02.01.2027: Wochen 9–17 = 9 Wochen à 56 km (nicht alle 17 Wochen).
    expect(cached.trainingPlan.planSummary.avgWeeklyKmRemaining).toBe(56);
  });

  test("Altplan ohne dateIso: Notnagel ist das Jahr von heute (unverändert), ohne Absturz", async () => {
    const { cached } = await sentContext(baseContext("2026-11-08T12:00:00.000Z", buildWeeks({ withDateIso: false })));
    const next14 = cached.trainingPlan.next14Days;
    expect(next14.length).toBeGreaterThan(0);
    expect(next14[0].dateIso).toBeUndefined();
    expect(next14[0].date).toBe("8. Nov");
  });
});
