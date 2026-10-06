import type { AiPlanSession, AiPlanWeek, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import type { TrainingPlanV2 } from "../../planV2/types";
import { normalizeTrainingPlan } from "../../planV2/normalizeTrainingPlan";
import { rebuildPlanFromWorkouts } from "../../core/deriveWeeksFromWorkouts";
import {
  computeMicroStructureDelta,
  collectMicroFindings,
  microSeverityTier,
  validateMicroStructure,
} from "../validation/validateMicroStructure";
import type { ValidationContext } from "../validation/validationContext";
import { buildCalendarReassignmentAction, proposeSingleSessionCalendarReassignment, buildCalendarReassignmentCandidates, computeSourceDayCapacity } from "./buildCalendarReassignmentAction";
import {
  assignSessionToBestCapacityDay,
  assignSessionToChosenDay,
  rankCalendarReassignmentCandidates,
} from "./assignSessionToBestCapacityDay";
import { proposeWeekCalendarReassignments } from "./proposeWeekCalendarReassignments";
import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";

// ---------- Fixtures ----------

const DE_MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DE_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function ymdOf(base: Date, plusDays: number): { ymd: string; label: string } {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + plusDays, 12);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ymd, label: `${d.getDate()}. ${DE_MONTHS[d.getMonth()]}` };
}

type Day = SessionType | [SessionType, string]; // Typ oder [Typ, Titel]

/** Eine Woche ab Montag `monday` (Jahr, Monat 1-12, Tag), 7 Tage Mo..So, mit echtem `dateIso`. */
function mkWeek(wn: number, monday: [number, number, number], phase: string, days: Day[]): AiPlanWeek {
  const base = new Date(monday[0], monday[1] - 1, monday[2]);
  const s: AiPlanSession[] = days.map((day, i) => {
    const [type, title] = Array.isArray(day) ? day : [day, day];
    const { ymd, label } = ymdOf(base, i);
    return { id: `w${wn}-${DE_DAYS[i].toLowerCase()}`, day: DE_DAYS[i], date: label, dateIso: ymd, type, title, km: type === "rest" ? 0 : 10 };
  });
  return { wn, phase, label: `Woche ${wn}`, dates: "", km: 60, s };
}

const oneOff = (id: string, title: string, specificDate: string, startTime: string, endTime: string): OneOffScheduleBlock => ({
  id, title, category: "other", startTime, endTime, notes: null, source: "eventkit", isRecurring: false, specificDate,
});

/** Termine wie im Testfall 2.1: Di „Sprint-Prüfung" + „Arbeit" abends, Mi–Fr Arbeit. */
function blocksFor(tuesdayYmd: string, wedYmd: string, thuYmd: string, friYmd: string): OneOffScheduleBlock[] {
  return [
    oneOff("b1", "Sprint-Prüfung", tuesdayYmd, "08:00", "14:00"),
    oneOff("b2", "Arbeit", tuesdayYmd, "16:00", "22:00"),
    oneOff("b3", "Arbeit", wedYmd, "09:00", "17:00"),
    oneOff("b4", "Arbeit", thuYmd, "09:00", "17:00"),
    oneOff("b5", "Arbeit", friYmd, "09:00", "17:00"),
  ];
}

const vctx = (phase: ValidationContext["phase"]): ValidationContext => ({
  planGoal: "marathon", currentWeekLoad: 0, weeklyAvgLoad: 0, phase,
  recoverySummary: { avgRecovery: 50, avgConfidence: 1, influenceWeight: 0.3, adjustedRecoveryInfluence: 15, recoveryStatus: "normal" },
});

const MONDAYS: Array<[number, number, number]> = [
  [2026, 9, 7], [2026, 9, 14], [2026, 9, 21], [2026, 9, 28], [2026, 10, 5],
];
const TEMPO_FR_LONG_SA: Day[] = ["rest", "interval", "easy", "easy", "tempo", "long", "easy"];

// ---------- 1. Plan „Tempo Fr, Long Sa" in jeder Woche + Testfall 2.1 ----------

describe("Delta: Plan mit 'Tempo Fr, Long Sa' in jeder Woche", () => {
  const weeks = MONDAYS.map((m, i) => mkWeek(10 + i, m, "build", TEMPO_FR_LONG_SA));
  const target = weeks[2]; // Mo 21.09. – So 27.09., Konfliktdienstag = 22.09.
  const blocks = blocksFor("2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25");
  const locked = new Set<string>([...weeks[0].s, ...weeks[1].s].map((s) => s.id).concat("w12-mo"));

  test("Ausgangslage: der Plan hat in jeder Woche schon einen Befund ≥ 75 (Altlast, nicht Teil des Tauschs)", () => {
    const res = validateMicroStructure(normalizeTrainingPlan(weeks), vctx("build"));
    expect(res.status).toBe("warn");
    expect(res.axes.micro?.score ?? 0).toBeGreaterThanOrEqual(75);
    const keyEve = collectMicroFindings(normalizeTrainingPlan(weeks), vctx("build")).filter((f) => f.rule === "key_session_eve");
    expect(keyEve).toHaveLength(MONDAYS.length);
  });

  test("Vorschlag für den Konflikt-Dienstag: Mittwoch statt Samstag, ohne ⚠️ und ohne Hinweis", () => {
    const result = proposeSingleSessionCalendarReassignment(weeks, target, "w12-di", blocks, locked);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    expect(result.action).not.toBeNull();
    const intervalPatch = result.patches.find((p) => p.sessionId === "w12-di");
    expect(intervalPatch?.changes.dateIso).toBe("2026-09-23");
    expect(intervalPatch?.changes.dateIso).not.toBe("2026-09-26");
    expect(result.action?.preview?.items.join(" | ")).not.toContain("⚠️");
    expect(result.action?.preview?.hints).toBeUndefined();
  });

  test("nicht jede Karte warnt: Kandidaten ohne neuen Befund sind unmarkiert, nur die wirklich schlechten sind Konflikt", () => {
    const result = proposeSingleSessionCalendarReassignment(weeks, target, "w12-di", blocks, locked);
    if (result.status !== "proposal") throw new Error("Vorschlag erwartet");
    const flagged = result.candidates.filter((c) => c.isConflict);
    const clean = result.candidates.filter((c) => !c.isConflict && c.warningReason === null);
    expect(clean.length).toBeGreaterThan(0);
    expect(flagged.length).toBeLessThan(result.candidates.length);
    // Sa (Intervall hinter dem Freitags-Tempo, davor 'long' → Back-to-back) und Do (Intervall vor dem Tempo) sind markiert.
    const byId = new Map(result.candidates.map((c) => [c.targetSessionId, c]));
    expect(byId.get("w12-sa")?.isConflict).toBe(true);
    expect(byId.get("w12-do")?.isConflict).toBe(true);
    expect(byId.get("w12-mi")?.isConflict).toBe(false);
  });

  test("Wochen-Batch mit ganzem Plan: Konflikt wird auf den Mittwoch gelegt, Batch gültig und ohne Warnung", () => {
    const conflicts = scanWeekForCalendarConflicts(target, blocks, locked);
    const proposals = proposeWeekCalendarReassignments(conflicts, target, blocks, locked, weeks);
    const di = proposals.find((p) => p.sessionId === "w12-di");
    expect(di && "toDayIso" in di ? di.toDayIso : null).toBe("2026-09-23");
  });
});

describe("Delta: Testfall 2.1 in einem Plan mit Altbefunden in den Nachbarwochen", () => {
  const sunday: Day = ["long", "Marathon-Pace-Long-Run 28 km"];
  const week12 = mkWeek(12, [2026, 10, 5], "peak", ["rest", ["interval", "Bahnintervalle 6x1000m"], "easy", "easy", "rest", "strength", sunday]);
  const others = [[2026, 9, 14], [2026, 9, 21], [2026, 9, 28]].map((m, i) => mkWeek(9 + i, m as [number, number, number], "peak", TEMPO_FR_LONG_SA));
  const plan = [...others, week12];
  const blocks = blocksFor("2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09");
  const locked = new Set<string>(["w12-mo", ...others.flatMap((w) => w.s.map((s) => s.id))]);

  test("das Intervall kommt auf den Mittwoch, nicht auf den Samstag; die Karte warnt nicht", () => {
    const result = proposeSingleSessionCalendarReassignment(plan, week12, "w12-di", blocks, locked);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    expect(result.patches.find((p) => p.sessionId === "w12-di")?.changes.dateIso).toBe("2026-10-07");
    expect(result.action?.preview?.items.join(" ")).not.toContain("⚠️");
    expect(result.candidates.find((c) => c.targetSessionId === "w12-sa")?.isConflict).toBe(true);
    expect(result.candidates.find((c) => c.targetSessionId === "w12-mi")?.isConflict).toBe(false);
  });
});

// ---------- 2. Block D: vorbelasteter Plan → Mittwoch gewinnt ----------

describe("Delta: vorbelasteter Plan (Analyse Anhang A, Block D)", () => {
  const week3 = mkWeek(3, [2026, 8, 3], "base", ["rest", "interval", "tempo", "easy", "rest", "easy", "long"]); // Intervall → Tempo: Altbefund 95
  const week12 = mkWeek(12, [2026, 10, 5], "peak", ["rest", "interval", "easy", "easy", "rest", "strength", "tempo"]);
  const plan = [week3, week12];
  const blocks = blocksFor("2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09");
  const locked = new Set<string>(["w12-mo"]);

  test("der Altbefund in Woche 3 verändert die Rangfolge nicht: Mittwoch gewinnt, Samstag nicht", () => {
    const result = proposeSingleSessionCalendarReassignment(plan, week12, "w12-di", blocks, locked);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    expect(result.action?.preview?.items[0]).toContain("Di → Mi");
    expect(result.action?.preview?.items.join(" ")).not.toContain("→ Sa");
    const candidates = buildCalendarReassignmentCandidates(week12, "w12-di", blocks, locked);
    const ranked = rankCalendarReassignmentCandidates(plan, "w12-di", candidates, computeSourceDayCapacity(week12, "w12-di", blocks));
    expect(ranked[0].targetSessionId).toBe("w12-mi");
    expect(ranked[0].microStructureTier).toBe(0);
    // Samstag-Intervall direkt vor dem Sonntags-Tempo ist ein NEUER Back-to-back-Befund (Stufe 3).
    const sat = ranked.find((r) => r.targetSessionId === "w12-sa");
    expect(sat?.microStructureTier).toBe(3);
    expect(sat?.isConflict).toBe(true);
  });

  test("Stufe 3 ist nie Auto-Vorschlag: ist der Samstag der einzige Kandidat, gibt es keinen Vorschlag", () => {
    const candidates = buildCalendarReassignmentCandidates(week12, "w12-di", blocks, locked).filter((c) => c.targetSessionId === "w12-sa");
    const result = assignSessionToBestCapacityDay(plan, "w12-di", candidates, computeSourceDayCapacity(week12, "w12-di", blocks), undefined, locked);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-safe-candidate");
  });
});

// ---------- 3. Block E: Wochengrenze Sonntag → Montag ----------

describe("Wochengrenze Sonntag → Montag (Analyse Anhang A, Block E)", () => {
  const twoWeeks = (sunday: Day, nextMonday: Day): AiPlanWeek[] => [
    mkWeek(12, [2026, 10, 5], "build", ["rest", "easy", "easy", "easy", "rest", "easy", sunday]),
    mkWeek(13, [2026, 10, 12], "build", [nextMonday, "easy", "easy", "rest", "easy", "easy", "easy"]),
  ];
  const score = (plan: AiPlanWeek[]) => validateMicroStructure(normalizeTrainingPlan(plan), vctx("build")).axes.micro?.score ?? 0;

  test("Intervall am Sonntag, Intervall am Montag → Befund 95 (Back-to-back über die Grenze)", () => {
    const plan = twoWeeks("interval", "interval");
    expect(validateMicroStructure(normalizeTrainingPlan(plan), vctx("build")).status).toBe("warn");
    expect(score(plan)).toBe(95);
  });

  test("Long Run am Sonntag, Tempo am Montag → Long-Run-Abstand (92)", () => {
    expect(score(twoWeeks("long", "tempo"))).toBe(92);
  });

  test("Intervall am Sonntag, Long Run am Montag → Schlüsseleinheit (75)", () => {
    expect(score(twoWeeks("interval", "long"))).toBe(75);
  });

  test("Dichte über die Grenze: Fr, So, Mo hart → 3 harte Einheiten in 4 Tagen", () => {
    const plan: AiPlanWeek[] = [
      mkWeek(12, [2026, 10, 5], "peak", ["rest", "easy", "easy", "easy", "interval", "easy", "interval"]),
      mkWeek(13, [2026, 10, 12], "peak", ["interval", "easy", "easy", "rest", "easy", "easy", "easy"]),
    ];
    expect(collectMicroFindings(normalizeTrainingPlan(plan), vctx("peak")).some((f) => f.rule === "high_density")).toBe(true);
  });

  test("Engine mit ganzem Plan sieht den Montag der Folgewoche; nur mit der Woche sieht sie ihn nicht", () => {
    const [week12, week13] = [
      mkWeek(12, [2026, 10, 5], "build", ["rest", "interval", "easy", "easy", "rest", "easy", "easy"]),
      mkWeek(13, [2026, 10, 12], "build", ["interval", "easy", "easy", "rest", "easy", "easy", "easy"]),
    ];
    const blocks = [oneOff("b1", "Klausur", "2026-10-06", "07:00", "22:00")];
    const candidates = buildCalendarReassignmentCandidates(week12, "w12-di", blocks);
    const sourceCap = computeSourceDayCapacity(week12, "w12-di", blocks);
    const withNext = rankCalendarReassignmentCandidates([week12, week13], "w12-di", candidates, sourceCap);
    const weekOnly = rankCalendarReassignmentCandidates([week12], "w12-di", candidates, sourceCap);

    const sunWith = withNext.find((r) => r.targetSessionId === "w12-so");
    const sunOnly = weekOnly.find((r) => r.targetSessionId === "w12-so");
    expect(sunWith?.microStructureTier).toBe(3); // Intervall So + Intervall Mo
    expect(sunWith?.isConflict).toBe(true);
    expect(sunOnly?.microStructureTier).toBe(0); // ohne Nachbarwoche unsichtbar → deshalb bekommt der Wochen-Batch den ganzen Plan
  });
});

// ---------- 4. Peak / Taper im Engine-Pfad ----------

describe("Phase je Woche kommt aus dem Plan (nicht mehr fest 'build')", () => {
  const weekIn = (phase: string) =>
    mkWeek(12, [2026, 10, 5], phase, ["rest", "interval", "easy", "easy", "rest", "strength", ["long", "Long Run 28 km"]]);
  const blocks = blocksFor("2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09");
  const locked = new Set<string>(["w12-mo"]);
  const satCandidate = (week: AiPlanWeek, phase?: "base" | "build" | "peak" | "taper") => {
    const candidates = buildCalendarReassignmentCandidates(week, "w12-di", blocks, locked);
    return rankCalendarReassignmentCandidates([week], "w12-di", candidates, computeSourceDayCapacity(week, "w12-di", blocks), phase)
      .find((r) => r.targetSessionId === "w12-sa")!;
  };

  test.each([
    ["Base", 75, 2],
    ["Build", 75, 2],
    ["Peak", 80, 2],
    ["Taper", 95, 3],
  ])("Intervall am Samstag vor dem Long Run in Phase %s → Delta-Schweregrad %d, Stufe %d", (phase, severity, tier) => {
    const sat = satCandidate(weekIn(phase));
    expect(sat.microStructureDeltaSeverity).toBe(severity);
    expect(sat.microStructureTier).toBe(tier);
    expect(sat.isConflict).toBe(true);
  });

  test("expliziter phase-Parameter übersteuert die Wochenphase", () => {
    expect(satCandidate(weekIn("Build"), "taper").microStructureDeltaSeverity).toBe(95);
    expect(satCandidate(weekIn("Taper"), "build").microStructureDeltaSeverity).toBe(75);
  });

  test("Taper: nie Auto-Vorschlag auf den Samstag; Peak: Samstag nur mit ⚠️-Warnung", () => {
    const only = (week: AiPlanWeek) =>
      assignSessionToBestCapacityDay([week], "w12-di", buildCalendarReassignmentCandidates(week, "w12-di", blocks, locked).filter((c) => c.targetSessionId === "w12-sa"),
        computeSourceDayCapacity(week, "w12-di", blocks), undefined, locked);

    const taper = only(weekIn("Taper"));
    expect(taper.ok).toBe(false);
    expect(taper.reason).toBe("no-safe-candidate");

    const peak = only(weekIn("Peak"));
    expect(peak.ok).toBe(true);
    expect(peak.microStructureTier).toBe(2);
    expect(peak.warning).toMatch(/Long Run/);
    expect(peak.hint).toBeNull();
  });

  test("Phasenwechsel innerhalb der Grenze: Sonntag in Peak, Montag in Taper → strengere Phase gilt", () => {
    const peakWeek = mkWeek(12, [2026, 10, 5], "peak", ["rest", "easy", "easy", "easy", "rest", "easy", "interval"]);
    const taperWeek = mkWeek(13, [2026, 10, 12], "taper", ["long", "easy", "easy", "rest", "easy", "easy", "easy"]);
    const findings = collectMicroFindings(normalizeTrainingPlan([peakWeek, taperWeek]), vctx("base"), {
      phaseOf: (ymd) => (ymd >= "2026-10-12" ? "taper" : "peak"),
    });
    expect(findings.find((f) => f.rule === "recovery_after_high")?.severity).toBe(95);
  });
});

// ---------- 5. Hinweis vs. Warnung (Datenebene) ----------

describe("Hinweis (40–74) und Warnung (ab 75) kommen getrennt aus der Engine", () => {
  const twoLong = mkWeek(5, [2026, 8, 10], "base", [["long", "Long Run Mo"], "easy", "rest", "easy", "easy", ["long", "Long Run Sa"], "easy"]);

  test("zwei Long Runs hintereinander (70): Hinweis, keine Warnung — Karte zeigt ihn in hints", () => {
    const result = assignSessionToChosenDay([twoLong], "w5-mo", "w5-so");
    expect(result.ok).toBe(true);
    expect(result.microStructureTier).toBe(1);
    expect(result.warning).toBeNull();
    expect(result.hint).toMatch(/lockere Tage/);
    const action = buildCalendarReassignmentAction("w5-mo", result, [twoLong]);
    expect(action?.preview?.items.join(" ")).not.toContain("⚠️");
    expect(action?.preview?.hints?.[0]).toMatch(/lockere Tage/);
  });

  test("Hinweis ist kein Konflikt: Kandidat bleibt in der Tageswahl ohne ⚠️, mit hintReason", () => {
    const ranked = rankCalendarReassignmentCandidates([twoLong], "w5-mo", [{ targetSessionId: "w5-so", capacity: cap("2026-08-16") }]);
    expect(ranked[0].isConflict).toBe(false);
    expect(ranked[0].microStructureWarning).toBeNull();
    expect(ranked[0].microStructureHint).toMatch(/lockere Tage/);
  });

  test("Intervall vor Long Run (75): Warnung, kein Hinweis", () => {
    const week = mkWeek(5, [2026, 8, 10], "base", ["interval", "easy", "easy", "easy", "rest", ["long", "Long Run Sa"], "easy"]);
    const result = assignSessionToChosenDay([week], "w5-mo", "w5-fr");
    expect(result.microStructureTier).toBe(2);
    expect(result.warning).toMatch(/Long Run/);
    expect(result.hint).toBeNull();
  });
});

function cap(dateIso: string) {
  return {
    dateIso, isWeekend: true, windowMinutes: 960, busyMinutes: 0, freeMinutes: 960, capacityScore: 1,
    isFullyBooked: false, isFullyFree: true, physicalLoadBlockTitles: [] as string[],
  };
}

// ---------- 6. Delta-Grundverhalten (Validator) ----------

describe("computeMicroStructureDelta", () => {
  const plan = (workouts: TrainingPlanV2["workouts"]) => normalizeTrainingPlan(rebuildPlanFromWorkouts({ workouts }));
  const day = (d: number) => new Date(2026, 9, d, 12).toISOString();
  const run = (id: string, d: number, sessionType: string, extra = {}) => ({ id, dateIso: day(d), sport: "run" as const, sessionType, title: sessionType, km: 10, ...extra });
  const rest = (id: string, d: number) => ({ id, dateIso: day(d), sport: "rest" as const, sessionType: "rest", title: "Rest", km: 0 });

  test("vorbestehender Befund zählt nicht; ein neuer schon", () => {
    const before = plan([rest("mo", 5), run("di", 6, "interval"), run("mi", 7, "interval"), run("do", 8, "easy"), rest("fr", 9), run("sa", 10, "easy"), run("so", 11, "easy")]);
    const same = computeMicroStructureDelta(before, before, vctx("build"));
    expect(same.newFindings).toHaveLength(0);
    expect(same.severity).toBe(0);
    expect(same.reason).toBeNull();

    // Donnerstag wird Tempo: neu ist Mi → Do (Back-to-back); Di → Mi bestand schon und zählt nicht.
    const after = plan([rest("mo", 5), run("di", 6, "interval"), run("mi", 7, "interval"), run("do", 8, "tempo"), rest("fr", 9), run("sa", 10, "easy"), run("so", 11, "easy")]);
    const d = computeMicroStructureDelta(before, after, vctx("build"));
    expect(d.severity).toBe(95);
    expect(d.newFindings.some((f) => f.dates.join() === "2026-10-07,2026-10-08")).toBe(true);
    expect(d.newFindings.some((f) => f.dates.join() === "2026-10-06,2026-10-07")).toBe(false);
  });

  test("aufgelöster Befund erscheint unter resolvedFindings und erzeugt keinen Schweregrad", () => {
    const before = plan([rest("mo", 5), run("di", 6, "interval"), run("mi", 7, "interval"), rest("do", 8), run("fr", 9, "easy"), run("sa", 10, "easy"), run("so", 11, "easy")]);
    const after = plan([rest("mo", 5), run("di", 6, "interval"), run("mi", 7, "easy"), rest("do", 8), run("fr", 9, "interval"), run("sa", 10, "easy"), run("so", 11, "easy")]);
    const d = computeMicroStructureDelta(before, after, vctx("build"));
    expect(d.resolvedFindings.some((f) => f.rule === "back_to_back_high")).toBe(true);
    expect(d.severity).toBe(0);
  });

  test("Stufen: <40 / 40–74 / 75–94 / ≥95", () => {
    expect([0, 39, 40, 74, 75, 94, 95, 100].map(microSeverityTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  test("Stufe 1 aus einer Rad-Einheit mit gespeicherter Intensität 'medium' nach einem Intervall (Build 55): Hinweis", () => {
    const before = plan([rest("mo", 5), run("di", 6, "easy"), run("mi", 7, "easy"), rest("do", 8), run("fr", 9, "easy"), { id: "sa", dateIso: day(10), sport: "bike" as const, sessionType: "bike", intensity: "medium" as const, title: "Rad", km: 30 }, run("so", 11, "easy")]);
    const after = plan([rest("mo", 5), run("di", 6, "easy"), run("mi", 7, "easy"), rest("do", 8), run("fr", 9, "interval"), { id: "sa", dateIso: day(10), sport: "bike" as const, sessionType: "bike", intensity: "medium" as const, title: "Rad", km: 30 }, run("so", 11, "easy")]);
    const d = computeMicroStructureDelta(before, after, vctx("build"));
    expect(d.tier).toBe(1);
    expect(d.warnings).toHaveLength(0);
    expect(d.hints).toHaveLength(1);
  });
});
