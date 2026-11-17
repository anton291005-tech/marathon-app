import { applyPlanPatches } from "../../lib/ai/actions";
import type { AiContext, AiPlanWeek } from "../../lib/ai/types";
import { toRemoteCoachPayload } from "../../lib/ai/getAiContext";
import { sessionDayIso } from "../../ai/mutations/sessionDayIso";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";
import { buildShiftCapacityContext } from "../shiftAdapter";
import { buildSoftenPatch, isHardDayType, proposeShiftWeek } from "../proposeShiftWeek";
import { proposeShiftSingle } from "../proposeShiftSingle";
import { SHIFT_BLOCKED_HINT, shiftTodayHasProposal, toShiftBatchState } from "../shiftWeekScan";
import { N, session, week } from "../__fixtures__/shiftFixtures";

const { toCoachSessionObject } = require("../../../api/_lib/coachHandlers");

const TODAY = "2026-11-16";

function ctx(entries: StoredShiftEntry[], todayYmd = TODAY) {
  const c = buildShiftCapacityContext({ enabled: true, worksShifts: true, entries, todayYmd });
  if (!c) throw new Error("Kontext erwartet");
  return c;
}

function dayOf(plan: AiPlanWeek[], id: string): string {
  for (const w of plan) for (const s of w.s) if (s.id === id) return sessionDayIso(s) as string;
  return "";
}

function hardPairs(plan: AiPlanWeek[]): string[] {
  const days = plan.flatMap((w) => w.s).filter((s) => isHardDayType(s.type)).map((s) => sessionDayIso(s) as string).sort();
  return days.filter((d, i) => i > 0 && Date.parse(d) - Date.parse(days[i - 1]) <= 86400000);
}

describe("Einzel-Pfad mit Dienstplan (proposeShiftSingle)", () => {
  it("Taper, Rennen am Samstag, Nachtdienst So/Mo, Intervall am Dienstag: nie später, nie näher ans Rennen", () => {
    const plan = [week(1, TODAY, ["easy", "interval", "easy", "easy", "rest", "race", "rest"], "taper")];
    const c = ctx([N("2026-11-15"), N("2026-11-16")]);
    const result = proposeShiftSingle({ plan, weekIndex: 0, sessionId: "w1-1", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(result.status).toBe("proposal");
    const patches = result.status === "proposal" ? result.patches : [];
    const after = applyPlanPatches(plan, patches);
    expect(dayOf(after, "w1-1") <= "2026-11-17").toBe(true);
    expect(dayOf(after, "w1-5")).toBe("2026-11-21");
    // Auch die manuelle Tageswahl bietet keinen späteren Tag an.
    const offered = result.status === "proposal" ? result.candidates.map((v) => dayOf(plan, v.targetSessionId)) : [];
    expect(offered.every((d) => d < "2026-11-17")).toBe(true);
  });

  it("legt Intervalle nie auf den Tag des ersten Nachtdienstes (eingeschränkt ist kein freier Zieltag)", () => {
    // Di Nacht → Mi nach der Nacht (Intervall), Di selbst „vor der Nacht“ eingeschränkt.
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "tempo", "easy", "long"])];
    const c = ctx([N("2026-11-17")]);
    const result = proposeShiftSingle({ plan, weekIndex: 0, sessionId: "w1-2", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(result.status).toBe("proposal");
    const action = result.status === "proposal" ? result.action : null;
    expect(action?.type).toBe("reassign_session_to_calendar");
    const after = applyPlanPatches(plan, result.status === "proposal" ? result.patches : []);
    const to = dayOf(after, "w1-2");
    expect(to).not.toBe("2026-11-17");
    expect(to).not.toBe("2026-11-18");
    expect(c.byDate[to] ? c.byDate[to].hard : "free").toBe("free");
    expect(hardPairs(after)).toEqual([]);
    expect(action?.preview?.items[0]).toMatch(/^Nach dem Nachtdienst \(22–6 Uhr\) ist Mittwoch kein guter Tag für Intervalle\./);
  });

  it("Rennen und gesperrte Einheiten: kein Vorschlag", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "race", "rest"], "taper")];
    const c = ctx([N("2026-11-17")]);
    expect(proposeShiftSingle({ plan, weekIndex: 0, sessionId: "w1-5", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }).status).toBe("locked");
    expect(
      proposeShiftSingle({ plan, weekIndex: 0, sessionId: "w1-2", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, lockedSessionIds: new Set(["w1-2"]) }).status,
    ).toBe("locked");
  });

  it("ohne Konflikt: no-conflict mit Tagen, die die harten Regeln einhalten", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "easy", "long"])];
    const c = ctx([N("2026-11-19")]);
    const result = proposeShiftSingle({ plan, weekIndex: 0, sessionId: "w1-3", scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(result.status).toBe("no-conflict");
  });
});

describe("„locker statt hart“ erhöht nie die Distanz", () => {
  it.each([
    [8.5, 8.5],
    [4.5, 4.5],
    [0.4, 0.4],
    [12, 9],
    [9, 9],
  ])("%s km → %s km", (km, expected) => {
    expect(buildSoftenPatch(session("x", "2026-11-16", "interval", km))?.changes.km).toBe(expected);
  });

  it.each([0, -3, Number.NaN])("ungültige Distanz %s → kein Patch", (km) => {
    expect(buildSoftenPatch(session("x", "2026-11-16", "interval", km))).toBeNull();
  });

  it("ohne gültige Distanz bleibt es beim Hinweis", () => {
    const plan = [week(1, TODAY, ["interval", "easy", "long", "easy", "rest", "easy", "easy"])];
    plan[0].s[0].km = 0;
    const nights = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map(N);
    const result = proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: ctx(nights), todayYmd: TODAY });
    expect(result.status).toBe("hint-only");
  });
});

describe("keine Schichtdaten im Coach-Payload", () => {
  it("ein gekürzter Lauf trägt keinen Dienst im Text – weder im Client- noch im Server-Payload", () => {
    const plan = [week(1, TODAY, ["interval", "easy", "long", "easy", "rest", "easy", "easy"])];
    const nights = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map(N);
    const result = proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: ctx(nights), todayYmd: TODAY });
    expect(result.status).toBe("proposal");
    const after = applyPlanPatches(plan, result.status === "proposal" ? result.patches : []);
    const context = { todayIso: TODAY, raceDateIso: null, goals: {}, plan: after, logs: {}, next14Days: [], availableScreens: [] } as AiContext;
    const client = JSON.stringify(toRemoteCoachPayload(context));
    const server = JSON.stringify(after.flatMap((w) => w.s).map((s) => toCoachSessionObject(s)));
    [client, server].forEach((payload) => {
      expect(payload).not.toMatch(/Nachtdienst|Spätdienst|Frühdienst|Dienst|Schicht|22–6|shift/i);
    });
    expect(client).toContain("Locker statt hart.");
  });
});

describe("Anzeige ohne interne Codes", () => {
  it("blockierter Wochenvorschlag → ruhiger Hinweis statt Prüf-Codes", () => {
    const state = toShiftBatchState({ status: "blocked", reasons: ["taper-later:w1-4", "2026-11-17>2026-11-18"] });
    expect(state).toEqual({ action: null, patches: [], status: "shift-hints", hints: [SHIFT_BLOCKED_HINT], source: "shift" });
    expect(JSON.stringify(state)).not.toMatch(/taper-later|>/);
  });

  it("„Vorschlag im Woche-Tab“ nur, wenn es für die heutige Einheit einen gibt", () => {
    const plan = [week(1, TODAY, ["interval", "easy", "easy", "easy", "rest", "easy", "long"])];
    const free = ctx([N("2026-11-15")]);
    expect(shiftTodayHasProposal({ plan, scheduleBlocks: [], shiftContext: free, todayYmd: TODAY, lockedSessionIds: new Set(), sessionId: "w1-0" })).toBe(true);
    expect(shiftTodayHasProposal({ plan, scheduleBlocks: [], shiftContext: free, todayYmd: TODAY, lockedSessionIds: new Set(), sessionId: "w1-1" })).toBe(false);
    expect(shiftTodayHasProposal({ plan, scheduleBlocks: [], shiftContext: free, todayYmd: TODAY, lockedSessionIds: new Set(), sessionId: null })).toBe(false);
  });

  it("abgelaufener Dienstplan hält den Modus nicht aktiv", () => {
    expect(buildShiftCapacityContext({ enabled: true, worksShifts: true, entries: [N("2026-10-01")], todayYmd: TODAY })).toBeNull();
    expect(buildShiftCapacityContext({ enabled: true, worksShifts: true, entries: [N("2026-11-10")], todayYmd: TODAY })).not.toBeNull();
  });
});
