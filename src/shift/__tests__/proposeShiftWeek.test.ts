import { applyPlanPatches } from "../../lib/ai/actions";
import type { AiPlanWeek } from "../../lib/ai/types";
import { sessionDayIso } from "../../ai/mutations/sessionDayIso";
import { scanWeekForCalendarConflicts } from "../../ai/mutations/scanWeekForCalendarConflicts";
import { buildLockedSessionIds } from "../../ai/mutations/lockedSessions";
import { describeCalendarConflictCause } from "../../ai/mutations/assignSessionToBestCapacityDay";
import { proposeSingleSessionCalendarReassignment } from "../../ai/mutations/buildCalendarReassignmentAction";
import { computeDayCapacityScore, computeSessionDayFitScore } from "../../scheduling/capacityScore";
import { mondayOf } from "../../planCore/dates";
import { buildShiftCapacityContext } from "../shiftAdapter";
import { isShiftModeEnabled } from "../shiftModeFlag";
import { isHardDayType, proposeShiftWeek, type ShiftWeekProposal } from "../proposeShiftWeek";
import { scanAfterShiftSave } from "../shiftWeekScan";
import { F, N, OFF, S, week } from "../__fixtures__/shiftFixtures";
import type { StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";

const TODAY = "2026-11-16"; // Montag

function ctx(entries: StoredShiftEntry[], todayYmd = TODAY) {
  const c = buildShiftCapacityContext({ enabled: true, worksShifts: true, entries, todayYmd });
  if (!c) throw new Error("Kontext erwartet");
  return c;
}

function expectProposal(result: ShiftWeekProposal): Extract<ShiftWeekProposal, { status: "proposal" }> {
  if (result.status !== "proposal") throw new Error(`Vorschlag erwartet, bekommen: ${result.status}`);
  return result;
}

function dayOf(plan: AiPlanWeek[], id: string): string | null {
  for (const w of plan) for (const s of w.s) if (s.id === id) return sessionDayIso(s);
  return null;
}

function hardPairs(plan: AiPlanWeek[]): string[] {
  const days = plan
    .flatMap((w) => w.s)
    .filter((s) => isHardDayType(s.type))
    .map((s) => sessionDayIso(s) as string)
    .sort();
  const out: string[] = [];
  for (let i = 1; i < days.length; i += 1) {
    const a = Date.UTC(+days[i - 1].slice(0, 4), +days[i - 1].slice(5, 7) - 1, +days[i - 1].slice(8, 10));
    const b = Date.UTC(+days[i].slice(0, 4), +days[i].slice(5, 7) - 1, +days[i].slice(8, 10));
    if ((b - a) / 86400000 <= 1) out.push(`${days[i - 1]}>${days[i]}`);
  }
  return out;
}

describe("Schicht-Wochenvorschlag – Szenarien", () => {
  it("S1 Pflege N-N-frei-frei: Intervall und Long Run ziehen auf freie Tage, ohne zwei harte Tage in Folge", () => {
    // Mo N, Di N → Mi nach der 2. Nacht (Intervall), Do 1. freier Tag (Long Run), Fr 2. freier Tag.
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "long", "rest", "easy", "easy"])];
    const entries = [N("2026-11-16"), N("2026-11-17"), OFF("2026-11-18"), OFF("2026-11-19")];
    const c = ctx(entries);
    expect(c.byDate["2026-11-18"].hard).toBe("unsuitable");
    expect(c.byDate["2026-11-19"].long).toBe("unsuitable");

    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    const after = applyPlanPatches(plan, result.patches);
    const intervalDay = dayOf(after, "w1-2") as string;
    const longDay = dayOf(after, "w1-3") as string;
    expect(intervalDay).not.toBe("2026-11-18");
    expect(longDay).not.toBe("2026-11-19");
    [intervalDay, longDay].forEach((d) => {
      const day = c.byDate[d];
      // Zieltag: Dienstplan „frei“ oder ohne Aussage.
      expect(!day || day.hard === "free" || day.long === "free").toBe(true);
    });
    expect(hardPairs(after)).toEqual([]);
    expect(mondayOf(longDay)).toBe(TODAY);
    // Text nennt Dienst und Merkmal.
    expect(result.action.preview?.items[0]).toMatch(/^Nach dem Nachtdienst \(22–6 Uhr\) ist Mittwoch kein guter Tag für Intervalle\. Vorschlag: \w+/);
    expect(result.action.preview?.title).toBe("Woche an deinen Dienstplan anpassen");
  });

  it("S1-Text: freier Zieltag → „da hast du frei“", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "easy", "easy"])];
    const c = ctx([N("2026-11-16"), N("2026-11-17"), OFF("2026-11-18"), OFF("2026-11-19"), OFF("2026-11-20"), OFF("2026-11-21"), OFF("2026-11-22")]);
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.moves[0].sentence).toMatch(/Vorschlag: (Freitag|Samstag|Sonntag) – da hast du frei\.$/);
  });

  it("S2 Spät → Früh: Tempo am Frühdienst-Tag ist eingeschränkt und zieht nur auf einen freien Tag", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "tempo", "easy", "rest", "easy", "long"])];
    const c = ctx([S("2026-11-17"), F("2026-11-18")]);
    expect(c.byDate["2026-11-18"]).toMatchObject({ hard: "limited", reasonCode: "quick_return" });
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.moves[0].sentence).toMatch(/nur bedingt ein guter Tag für einen Tempolauf/);
    const after = applyPlanPatches(plan, result.patches);
    expect(dayOf(after, "w1-2")).not.toBe("2026-11-18");
    expect(hardPairs(after)).toEqual([]);
  });

  it("S2 ohne freien Tag: kein Vorschlag, nur Hinweis", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "tempo", "easy", "rest", "easy", "easy"])];
    // Jeder andere Tag ist für harte Einheiten eingeschränkt (Spät → Früh-Folgen, langer Dienst).
    const long = (d: string) => ({ dateYmd: d, kind: "custom" as const, start: "05:30", end: "15:00", label: null });
    const entries = [
      S("2026-11-15", "17:00", "00:30"), // → Mo eingeschränkt (Spätdienst nach Mitternacht)
      S("2026-11-16", "17:00", "00:30"), // → Di eingeschränkt
      S("2026-11-17"), // Spät 14–22 …
      F("2026-11-18"), // … dann Früh 6 Uhr: Quick Return am Tempo-Tag
      long("2026-11-19"),
      long("2026-11-20"),
      long("2026-11-21"),
      long("2026-11-22"),
    ];
    const c = ctx(entries);
    const result = proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(result.status).toBe("hint-only");
  });

  it("S3 Gastro 17:00–00:30 vor dem Intervalltag → eingeschränkt, Text nennt den Spätdienst", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "easy", "long"])];
    const c = ctx([S("2026-11-17", "17:00", "00:30")]);
    expect(c.byDate["2026-11-18"]).toMatchObject({ hard: "limited", reasonCode: "late_shift" });
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.moves[0].sentence).toMatch(/^Nach dem Spätdienst \(17:00–0:30 Uhr\)/);
  });

  it("S4 nur Frühdienste mit Nachmittagsfenster → kein Konflikt", () => {
    const plan = [week(1, TODAY, ["easy", "interval", "easy", "tempo", "rest", "easy", "long"])];
    const c = ctx(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map(F));
    expect(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }).status).toBe("no-conflicts");
  });

  it("S5 Rennwoche, Nachtdienst 2 Tage vor dem Rennen: Rennen unangetastet, nichts rückt später", () => {
    // Fr 20 Nacht → Fr eingeschränkt (vor der Nacht), Sa nach der Nacht. Tempo am Fr zieht auf einen früheren Tag.
    const plan = [week(1, TODAY, ["rest", "easy", "easy", "easy", "tempo", "easy", "race"], "taper")];
    const c = ctx([N("2026-11-20")]);
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.patches.some((p) => p.sessionId === "w1-6")).toBe(false);
    expect(result.softened).toEqual([]);
    const after = applyPlanPatches(plan, result.patches);
    expect(dayOf(after, "w1-6")).toBe("2026-11-22");
    expect((dayOf(after, "w1-4") as string) < "2026-11-20").toBe(true);
    expect(hardPairs(after)).toEqual([]);
  });

  it("S5b Taper: harte Einheit auf einem ungeeigneten Tag zieht nie später – stattdessen „locker statt hart“", () => {
    // Nacht So → Mo ungeeignet für die Intervalle; frühere Tage gibt es nicht (Mo ist der erste Tag).
    const plan = [week(1, TODAY, ["interval", "easy", "easy", "easy", "rest", "easy", "long"], "taper")];
    const c = ctx([N("2026-11-15")]);
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.moves).toEqual([]);
    expect(result.softened.map((x) => x.sessionId)).toEqual(["w1-0"]);
    expect(dayOf(applyPlanPatches(plan, result.patches), "w1-0")).toBe("2026-11-16");
  });

  it("Long Run bleibt in seiner Kalenderwoche und hält Abstand zum Long Run der Vorwoche – sonst nur Hinweis", () => {
    const prev = week(0, "2026-11-09", ["easy", "easy", "interval", "easy", "rest", "easy", "long"], "build", "w0");
    const cur = week(1, TODAY, ["easy", "rest", "interval", "easy", "rest", "easy", "long"]);
    const plan = [prev, cur];
    // So 22 ungeeignet (Nacht Sa → So). Mo–Fr lägen weniger als 6 Tage nach dem Long Run der Vorwoche (So 15),
    // Sa 21 ist vor der Nacht ungeeignet: kein zulässiger Tag, und ein Long Run wird nie gestrichen.
    const c = ctx([N("2026-11-21")]);
    const result = proposeShiftWeek({ plan, weekIndex: 1, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY });
    expect(result.status).toBe("hint-only");
    expect(result.status === "hint-only" ? result.hints.join(" ") : "").toMatch(/„Long Run“ bleibt – nach dem Nachtdienst \(22–6 Uhr\)/);
  });

  it("gesperrte Einheiten sind nie Quelle oder Ziel", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "easy", "long"])];
    const c = ctx([N("2026-11-17")]);
    const locked = new Set(["w1-4", "w1-5"]);
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, lockedSessionIds: locked }));
    expect(result.patches.some((p) => locked.has(p.sessionId))).toBe(false);
    expect(dayOf(applyPlanPatches(plan, result.patches), "w1-2")).toBe("2026-11-16");
    // Ist die Konflikt-Einheit selbst gesperrt, gibt es nichts vorzuschlagen.
    expect(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, lockedSessionIds: new Set(["w1-2"]) }).status).toBe(
      "no-conflicts",
    );
  });

  it("kein sicherer Tag für Intervalle auf einem ungeeigneten Tag → „locker statt hart“ als Patch", () => {
    // Alle anderen Tage sind belegt mit Nächten bzw. Folgetagen; harter Tag ohne Ausweg.
    const plan = [week(1, TODAY, ["interval", "easy", "long", "easy", "rest", "easy", "easy"])];
    const nights = ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map(N);
    const c = ctx(nights);
    const result = expectProposal(proposeShiftWeek({ plan, weekIndex: 0, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY }));
    expect(result.softened.map((s) => s.sessionId)).toEqual(["w1-0"]);
    const patch = result.patches.find((p) => p.sessionId === "w1-0");
    expect(patch?.changes).toMatchObject({ type: "easy", kind: "E", title: "Lockerer Lauf" });
    expect(patch?.changes.km).toBeLessThanOrEqual(8);
    // Long Run wird nie gestrichen.
    expect(result.patches.some((p) => p.sessionId === "w1-2" && p.changes.type === "easy")).toBe(false);
    expect(result.softened[0].sentence).toMatch(/Vorschlag: heute locker laufen\.$/);
  });

  it("nach dem Speichern: aktuelle Woche ohne Konflikt → nächste Woche wird gescannt", () => {
    const plan = [week(1, TODAY, ["easy", "easy", "easy", "easy", "rest", "easy", "long"]), week(2, "2026-11-23", ["easy", "easy", "interval", "easy", "rest", "easy", "long"])];
    const c = ctx([N("2026-11-24")]);
    const res = scanAfterShiftSave({ plan, scheduleBlocks: [], shiftContext: c, todayYmd: TODAY, lockedSessionIds: new Set() });
    expect(res?.weekIndex).toBe(1);
    expect(res?.batch.status).toBe("proposal");
  });
});

describe("Schicht-Modus aus → altes Verhalten", () => {
  const plan = [week(1, TODAY, ["easy", "easy", "interval", "easy", "rest", "easy", "long"])];
  const entries = [N("2026-11-17")];

  it("S6 works_shifts=false → kein Kontext, Scan und Fit bit-gleich", () => {
    expect(buildShiftCapacityContext({ enabled: true, worksShifts: false, entries, todayYmd: TODAY })).toBeNull();
    expect(buildShiftCapacityContext({ enabled: true, worksShifts: null, entries, todayYmd: TODAY })).toBeNull();
    const ctxNull = buildShiftCapacityContext({ enabled: true, worksShifts: false, entries, todayYmd: TODAY });
    expect(scanWeekForCalendarConflicts(plan[0], [], new Set(), ctxNull)).toEqual(scanWeekForCalendarConflicts(plan[0], []));
    const day = computeDayCapacityScore("2026-11-18", [], ctxNull);
    expect(day).toEqual(computeDayCapacityScore("2026-11-18", []));
    expect("shift" in day).toBe(false);
  });

  it("S7 Flag aus → kein Kontext", () => {
    expect(isShiftModeEnabled("0")).toBe(false);
    expect(isShiftModeEnabled("false")).toBe(false);
    expect(isShiftModeEnabled(undefined)).toBe(true);
    expect(isShiftModeEnabled("1")).toBe(true);
    expect(buildShiftCapacityContext({ enabled: isShiftModeEnabled("0"), worksShifts: true, entries, todayYmd: TODAY })).toBeNull();
  });

  it("mit Kontext: Fit = min(Kalender, Dienstplan); Kalender-Termine wirken weiter", () => {
    const c = ctx(entries);
    const interval = plan[0].s[2];
    const withShift = computeDayCapacityScore("2026-11-18", [], c);
    expect(computeSessionDayFitScore(interval, withShift)).toBe(0.2);
    const easy = plan[0].s[3];
    expect(computeSessionDayFitScore(easy, withShift)).toBe(0.5);
    const rest = plan[0].s[4];
    expect(computeSessionDayFitScore(rest, withShift)).toBe(computeSessionDayFitScore(rest, computeDayCapacityScore("2026-11-18", [])));
    // Wochen-Scan sieht den Dienstplan-Konflikt.
    const conflicts = scanWeekForCalendarConflicts(plan[0], [], buildLockedSessionIds(plan, {}, TODAY), c);
    expect(conflicts.map((x) => x.sessionId)).toContain("w1-2");
    expect(conflicts.find((x) => x.sessionId === "w1-2")?.conflictReason).toMatch(/^Dienstplan: Nach dem Nachtdienst/);
  });

  it("Einzel-Knopf (📅-Pfad) nutzt den Dienstplan: Konflikt mit Grund „nach dem Nachtdienst“", () => {
    const c = ctx(entries);
    const interval = plan[0].s[2];
    expect(describeCalendarConflictCause(interval, computeDayCapacityScore("2026-11-18", [], c))).toBe("nach dem Nachtdienst (22–6 Uhr)");
    expect(describeCalendarConflictCause(interval, computeDayCapacityScore("2026-11-18", []))).toBe("wegen Kalendertermin");
    const single = proposeSingleSessionCalendarReassignment(plan, plan[0], "w1-2", [], new Set(), c);
    expect(single).toMatchObject({ status: "proposal", conflictCause: "nach dem Nachtdienst (22–6 Uhr)" });
    expect(proposeSingleSessionCalendarReassignment(plan, plan[0], "w1-2", [], new Set()).status).toBe("no-conflict");
  });
});
