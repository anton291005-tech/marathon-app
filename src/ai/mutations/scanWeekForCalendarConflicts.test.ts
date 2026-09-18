import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { RecurringScheduleBlock, OneOffScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";

type DaySpec = { id: string; type: SessionType; date: string; day: string; title?: string };

function buildPlan(specs: DaySpec[]): AiPlanWeek[] {
  const s: AiPlanSession[] = specs.map((spec) => ({
    id: spec.id,
    day: spec.day,
    date: spec.date,
    type: spec.type,
    title: spec.title ?? spec.type,
    km: spec.type === "rest" ? 0 : 8,
  }));
  return [{ wn: 1, phase: "Base", label: "Woche 1", dates: "10.-16. Aug", km: 40, s }];
}

// Montag 10. Aug 2026 .. Sonntag 16. Aug 2026 (parseSessionDateLabel defaults to Jahr 2026)
const BASE_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag", title: "Intervalle" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag", title: "Easy Run" },
  { id: "s-wed", type: "interval", date: "12. Aug", day: "Mittwoch", title: "Intervalle" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag", title: "Easy Run" },
  { id: "s-fri", type: "rest", date: "14. Aug", day: "Freitag", title: "Ruhetag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag", title: "Long Run" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag", title: "Easy Run" },
];

function recurring(overrides: Partial<RecurringScheduleBlock>): RecurringScheduleBlock {
  return {
    id: "r1",
    title: "Job",
    category: "job",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    source: "manual",
    isRecurring: true,
    dayOfWeek: 1,
    recurrenceStartDate: null,
    recurrenceEndDate: null,
    ...overrides,
  };
}

function oneOff(overrides: Partial<OneOffScheduleBlock>): OneOffScheduleBlock {
  return {
    id: "o1",
    title: "Termin",
    category: "other",
    startTime: "09:00",
    endTime: "17:00",
    notes: null,
    source: "manual",
    isRecurring: false,
    specificDate: "2026-08-10",
    ...overrides,
  };
}

describe("scanWeekForCalendarConflicts", () => {
  test("Woche ohne Kalender-Blocks -> keine Konflikte", () => {
    const plan = buildPlan(BASE_WEEK);
    expect(scanWeekForCalendarConflicts(plan[0], [])).toEqual([]);
  });

  test("ein Block überlastet genau den Tag einer hochintensiven Session -> ein Konflikt", () => {
    const plan = buildPlan(BASE_WEEK);
    // Montag (2026-08-10) ist Intervall-Tag; Werktagsfenster 06:00-22:00 fast komplett durch Job belegt.
    const blocks = [recurring({ dayOfWeek: 1, startTime: "06:00", endTime: "21:50" })];
    const conflicts = scanWeekForCalendarConflicts(plan[0], blocks);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sessionId).toBe("s-mon");
    expect(conflicts[0].dayIso).toBe("2026-08-10");
    expect(conflicts[0].conflictReason).toContain("Intervalle");
  });

  test("mehrere überlastete Tage inkl. ganztägigem Event -> mehrere Konflikte, unterschiedliche Reason-Texte", () => {
    const plan = buildPlan(BASE_WEEK);
    const blocks = [
      // Montag (Intervalle): ganztägig blockiert.
      recurring({ dayOfWeek: 1, startTime: "00:00", endTime: "23:59" }),
      // Samstag (Long Run): fast komplett blockiert, aber nicht ganztägig.
      oneOff({ specificDate: "2026-08-15", startTime: "07:00", endTime: "22:55" }),
    ];
    const conflicts = scanWeekForCalendarConflicts(plan[0], blocks);

    expect(conflicts.map((c) => c.sessionId).sort()).toEqual(["s-mon", "s-sat"]);

    const monConflict = conflicts.find((c) => c.sessionId === "s-mon");
    expect(monConflict?.conflictReason).toContain("komplett belegt");

    const satConflict = conflicts.find((c) => c.sessionId === "s-sat");
    expect(satConflict?.conflictReason).toContain("Fit-Score");
    expect(satConflict?.conflictReason).not.toContain("komplett belegt");
  });

  test("Easy-Run-Tage werden durch Kalender-Last kaum beeinflusst und bleiben ohne Konflikt", () => {
    const plan = buildPlan(BASE_WEEK);
    // Dienstag (Easy Run) fast komplett belegt – niedrige Intensität hat hohe Kalender-Toleranz.
    const blocks = [recurring({ dayOfWeek: 2, startTime: "06:00", endTime: "21:50" })];
    const conflicts = scanWeekForCalendarConflicts(plan[0], blocks);
    expect(conflicts.some((c) => c.sessionId === "s-tue")).toBe(false);
  });

  test("Session mit nicht parsbarem Datum wird übersprungen statt einen Fehler zu werfen", () => {
    const plan = buildPlan([...BASE_WEEK.slice(0, 6), { id: "s-broken", type: "easy", date: "??", day: "Sonntag" }]);
    expect(() => scanWeekForCalendarConflicts(plan[0], [])).not.toThrow();
    expect(scanWeekForCalendarConflicts(plan[0], []).some((c) => c.sessionId === "s-broken")).toBe(false);
  });
});

// Montag 14. Sep 2026 .. Sonntag 20. Sep 2026 — Long Run 18 km MP am Sonntag (20.09.), Fußballturnier 11–19 Uhr.
const TOURNAMENT_WEEK: DaySpec[] = [
  { id: "s-mon", type: "easy", date: "14. Sep", day: "Montag", title: "Easy Run" },
  { id: "s-tue", type: "interval", date: "15. Sep", day: "Dienstag", title: "Intervalle" },
  { id: "s-wed", type: "easy", date: "16. Sep", day: "Mittwoch", title: "Easy Run" },
  { id: "s-thu", type: "easy", date: "17. Sep", day: "Donnerstag", title: "Easy Run" },
  { id: "s-fri", type: "rest", date: "18. Sep", day: "Freitag", title: "Ruhetag" },
  { id: "s-sat", type: "easy", date: "19. Sep", day: "Samstag", title: "Easy Run" },
  { id: "s-sun", type: "long", date: "20. Sep", day: "Sonntag", title: "Long Run 18 km MP" },
];

function sundayBlock(title: string): OneOffScheduleBlock {
  return oneOff({
    id: "o-sun",
    title,
    category: "other",
    source: "eventkit",
    specificDate: "2026-09-20",
    startTime: "11:00",
    endTime: "19:00",
  });
}

describe("scanWeekForCalendarConflicts – körperliche Belastung (Titel-basiert)", () => {
  test("Fußballturnier So 11–19 Uhr (category other) ist ein Konflikt für Long Run 18 km MP, Grund nennt den Termin", () => {
    const week = buildPlan(TOURNAMENT_WEEK)[0];
    const conflicts = scanWeekForCalendarConflicts(week, [sundayBlock("Fußballturnier")]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ sessionId: "s-sun", dayIso: "2026-09-20" });
    expect(conflicts[0].conflictReason).toContain("Fußballturnier");
  });

  test("gleiche Zeiten, Titel Schicht oder Arbeit: wie bisher kein Konflikt (50 % belegt)", () => {
    const week = buildPlan(TOURNAMENT_WEEK)[0];
    expect(scanWeekForCalendarConflicts(week, [sundayBlock("Schicht")])).toEqual([]);
    expect(scanWeekForCalendarConflicts(week, [sundayBlock("Arbeit")])).toEqual([]);
  });

  test("Fußballturnier + Easy Run am selben Tag: kein Konflikt", () => {
    const easyWeek = TOURNAMENT_WEEK.map((spec) =>
      spec.id === "s-sun" ? { ...spec, type: "easy" as const, title: "Easy Run" } : spec,
    );
    const week = buildPlan(easyWeek)[0];
    expect(scanWeekForCalendarConflicts(week, [sundayBlock("Fußballturnier")])).toEqual([]);
  });
});
