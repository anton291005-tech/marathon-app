// Regression: nach Plan-Ende fiel der Coach-Kontext auf weeks[0] zurück (findCurrentPlanWeek fand
// keine künftige Session) und der Coach sprach über das erste Training des Plans. Geprüft wird der
// tatsächlich an Claude gesendete System-Prompt (gecachter JSON-Block + dynamische Zusammenfassung).

const mockCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => jest.fn());

process.env.ANTHROPIC_API_KEY = "test-key-coachHandlers-post-plan-spec";

const Anthropic = require("@anthropic-ai/sdk");
const { handleAiCoach } = require("../../api/_lib/coachHandlers");

const weeks = [
  {
    wn: 1,
    phase: "Grundlage",
    km: 40,
    s: [{ id: "w1-di", day: "Di", date: "7. Jul", title: "ERSTER LAUF", km: 8, type: "easy" }],
  },
  {
    wn: 10,
    phase: "Spezifisch",
    km: 70,
    s: [{ id: "w10-so", day: "So", date: "13. Sep", title: "Long Run mit Endbeschleunigung", km: 30, type: "long" }],
  },
  {
    wn: 11,
    phase: "Taper",
    km: 45,
    s: [{ id: "w11-so", day: "So", date: "20. Sep", title: "Letzter Long Run", km: 18, type: "long" }],
  },
  {
    wn: 12,
    phase: "Rennwoche",
    km: 55,
    s: [
      { id: "w12-sa", day: "Sa", date: "26. Sep", title: "Ruhetag", km: 0, type: "rest" },
      { id: "w12-so", day: "So", date: "27. Sep", title: "WARSCHAU MARATHON", km: 42.2, type: "race" },
    ],
  },
];

const prepStatus = (focus) => ({
  status: "completed",
  completedBy: "race_done",
  raceYmd: "2026-09-27",
  raceName: "Warschau Marathon",
  raceRun: true,
  result: {
    finishTime: "3:11:15",
    finishTimeSeconds: 11475,
    finishTimeConfirmed: true,
    goal: "Ziel: Sub 2:50",
    goalSeconds: 10200,
    pacePerKm: "4:32 /km",
    distanceKm: 42.195,
  },
  focus,
});

const baseContext = (todayIso, extra = {}) => ({
  todayIso,
  raceDateIso: "2026-09-27T10:00:00.000Z",
  goals: { targetTime: "2:50:00" },
  trainingPlan: { source: "display", weeks },
  recoveryDomain: { homeRecoveryScore0_100: 80 },
  ...extra,
});

async function sentSystem(context, reply = "Alles klar.") {
  mockCreate.mockResolvedValue({ content: [{ text: reply }] });
  const res = await handleAiCoach({ input: "Wie geht es weiter?", context });
  const system = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0].system;
  return { res, cachedText: system[1].text, cached: JSON.parse(system[1].text), cacheControl: system[1].cache_control, dynamic: system[2].text };
}

describe("Coach-Kontext nach Plan-Ende", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    Anthropic.mockReset();
    Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  });

  test("Plan läuft: aktuelle Woche und nächste Einheit wie bisher", async () => {
    const { cached, dynamic } = await sentSystem(baseContext("2026-09-18T07:00:00.000Z"));
    expect(cached.prepStatus).toBeNull();
    expect(cached.trainingPlan.planSummary.currentPhase).toBe("Taper");
    expect(cached.trainingPlan.next14Days.map((s) => s.title)).toContain("Letzter Long Run");
    expect(dynamic).toContain("aktuelle Phase: Taper");
    expect(dynamic).toContain("Nächste/heutige Einheit");
  });

  test("Plan abgeschlossen: kein weeks[0], keine aktuelle Woche, Rennergebnis drin", async () => {
    const { cached, cachedText, dynamic, cacheControl } = await sentSystem(
      baseContext("2026-10-03T07:00:00.000Z", { prepStatus: prepStatus("recovery") }),
    );
    expect(cacheControl).toEqual({ type: "ephemeral" });
    expect(cachedText).not.toContain("ERSTER LAUF");
    expect(cachedText).not.toContain("Grundlage");
    expect(cached.prepStatus).toMatchObject({
      status: "completed",
      raceName: "Warschau Marathon",
      focus: "recovery",
      result: { finishTime: "3:11:15", finishTimeConfirmed: true, goal: "Ziel: Sub 2:50", pacePerKm: "4:32 /km" },
    });
    expect(cached.trainingPlan.status).toBe("completed");
    expect(cached.trainingPlan.next14Days).toEqual([]);
    expect(cached.trainingPlan.planSummary.currentPhase).toBe("abgeschlossen");
    expect(cached.trainingPlan.recapLastWeeks.map((w) => w.week)).toEqual([10, 11, 12]);
    expect(dynamic).toContain("Vorbereitung abgeschlossen: Warschau Marathon am 2026-09-27");
    expect(dynamic).toContain("Rennergebnis: 3:11:15 (bestätigt), Pace 4:32 /km, Ziel: Sub 2:50");
    expect(dynamic).toContain("Fokus auf Erholung");
    expect(dynamic).not.toContain("Nächste/heutige Einheit");
    expect(dynamic).not.toContain("aktuelle Phase");
  });

  test("Rückblick zeigt nur die letzten Planwochen, ohne Ruhetage", async () => {
    const many = [{ wn: 0, phase: "Grundlage", km: 30, s: [{ id: "w0", day: "Mo", date: "29. Jun", title: "ERSTER LAUF", km: 5, type: "easy" }] }, ...weeks];
    const { cached, cachedText } = await sentSystem({
      ...baseContext("2026-10-03T07:00:00.000Z", { prepStatus: prepStatus("recovery") }),
      trainingPlan: { source: "display", weeks: many },
    });
    expect(cached.trainingPlan.recapLastWeeks.map((w) => w.week)).toEqual([10, 11, 12]);
    expect(cachedText).not.toContain("ERSTER LAUF");
    expect(cached.trainingPlan.recapLastWeeks[2].sessions.map((s) => s.type)).toEqual(["race"]);
  });

  test("unbestätigte Zeit bleibt als Apple-Health-Vorschlag gekennzeichnet; ohne Zeit keine erfundene", async () => {
    const unconfirmed = prepStatus("recovery");
    unconfirmed.result.finishTimeConfirmed = false;
    let out = await sentSystem(baseContext("2026-10-03", { prepStatus: unconfirmed }));
    expect(out.dynamic).toContain("3:11:15 (laut Apple Health, unbestätigt)");

    const none = prepStatus("recovery");
    none.result = { ...none.result, finishTime: null, finishTimeSeconds: null, pacePerKm: "4:32 /km" };
    out = await sentSystem(baseContext("2026-10-03", { prepStatus: none }));
    expect(out.dynamic).toContain("Rennergebnis: Rennen gelaufen, keine Zeit bekannt, Ziel: Sub 2:50");
    expect(out.cached.prepStatus.result.pacePerKm).toBeNull();
  });

  test("Plan ohne Rennen (plan_ended): kein Rennen, kein Ergebnis, kein Erholungsfokus", async () => {
    const ended = { ...prepStatus("recovery"), completedBy: "plan_ended", raceName: null, raceRun: true };
    ended.result = { ...ended.result, finishTime: null, finishTimeSeconds: null, goal: null, goalSeconds: null };
    const { cached, cachedText, dynamic } = await sentSystem(baseContext("2026-10-03", { prepStatus: ended }));
    expect(cached.prepStatus).toMatchObject({ raceRun: false, focus: "plan_over" });
    expect(dynamic).toContain("letzter Trainingstag 2026-09-27");
    for (const text of [cachedText.slice(0, cachedText.indexOf('"raceDateIso"')), dynamic]) {
      expect(text).not.toContain("Fokus auf Erholung");
      expect(text).not.toContain("Rennergebnis");
      expect(text).not.toContain("Zielrennen");
    }
    expect(dynamic).not.toContain("Nächste/heutige Einheit");
  });

  test("Renntag nur vorbei (keine Zeit, nicht abgehakt): neutral, kein Erholungsfokus", async () => {
    const passed = { ...prepStatus("recovery"), completedBy: "date_passed", raceRun: false };
    passed.result = { ...passed.result, finishTime: null, finishTimeSeconds: null };
    const { cached, dynamic } = await sentSystem(baseContext("2026-10-03", { prepStatus: passed }));
    expect(cached.prepStatus.focus).toBe("plan_over");
    expect(dynamic).toContain("kein Ergebnis und kein abgehaktes Rennen bekannt");
    expect(dynamic).not.toContain("Fokus auf Erholung");
    expect(dynamic).not.toContain("Rennergebnis");
  });

  test("15 Tage nach dem Rennen: kein Erholungsfokus, bereit für eine neue Vorbereitung", async () => {
    const { cached, cachedText, dynamic } = await sentSystem(
      baseContext("2026-10-12T07:00:00.000Z", { prepStatus: prepStatus("ready_for_new_prep") }),
    );
    expect(cached.prepStatus.focus).toBe("ready_for_new_prep");
    expect(cachedText).not.toContain("Fokus auf Erholung");
    expect(dynamic).not.toContain("Fokus auf Erholung");
    expect(dynamic).toContain("bereit für eine neue Vorbereitung");
  });

  test("Cache-Stabilität: derselbe Tag ergibt denselben gecachten Block, unabhängig von der Uhrzeit", async () => {
    const morning = await sentSystem(baseContext("2026-10-03T06:01:02.345Z", { prepStatus: prepStatus("recovery") }));
    const evening = await sentSystem(baseContext("2026-10-03T19:45:59.999Z", { prepStatus: prepStatus("recovery") }));
    expect(evening.cachedText).toBe(morning.cachedText);
    expect(morning.cachedText).not.toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z"todayIso|"todayIso":"[^"]{11,}"/);
    expect(morning.cached.todayIso).toBe("2026-10-03");
  });

  test("ohne Abschluss-Zustand vom Client (alter Client): Plan vorbei → letzte Woche statt Woche 1", async () => {
    const { cached } = await sentSystem(baseContext("2026-10-03T07:00:00.000Z"));
    expect(cached.trainingPlan.planSummary.currentPhase).toBe("Rennwoche");
  });

  test("ungültiger Abschluss-Zustand wird ignoriert", async () => {
    const { cached } = await sentSystem(
      baseContext("2026-09-18T07:00:00.000Z", { prepStatus: { status: "completed", raceYmd: "gestern" } }),
    );
    expect(cached.prepStatus).toBeNull();
    expect(cached.trainingPlan.status).toBeUndefined();
  });

  test("nach Plan-Ende keine Taper-/Shift-Race-Vorschläge, Navigation bleibt möglich", async () => {
    const ctx = baseContext("2026-10-03", { prepStatus: prepStatus("recovery") });
    const taper = JSON.stringify({ mode: "coach", message: "Wir tapern.", action: { type: "taper_before_race", payload: {} } });
    expect((await sentSystem(ctx, taper)).res.body.action).toBeNull();
    const shift = JSON.stringify({ mode: "coach", message: "Rennen verschieben.", action: { type: "shift_race_date", payload: { shiftDays: 7 } } });
    expect((await sentSystem(ctx, shift)).res.body.action).toBeNull();
    const nav = JSON.stringify({ mode: "navigator", message: "Hier entlang.", action: { type: "navigate_to_screen", payload: { targetScreen: "settings", targetScreenLabel: "Einstellungen" } } });
    expect((await sentSystem(ctx, nav)).res.body.action?.type).toBe("navigate_to_screen");
    // Während des Plans bleibt Taper erlaubt.
    expect((await sentSystem(baseContext("2026-09-18"), taper)).res.body.action?.type).toBe("taper_before_race");
  });
});
