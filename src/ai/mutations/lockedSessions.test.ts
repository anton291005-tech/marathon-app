import { buildLockedSessionIds } from "./lockedSessions";
import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";
import { proposeWeekCalendarReassignments, type WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import { validateWeekReassignmentBatch } from "./validateWeekReassignmentBatch";
import {
  buildCalendarReassignmentCandidates,
  proposeSingleSessionCalendarReassignment,
} from "./buildCalendarReassignmentAction";
import { assignSessionToChosenDay, isSessionInCalendarConflict } from "./assignSessionToBestCapacityDay";
import { freezeTimeForTests } from "../../core/time/timeSystem";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { RecurringScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import type { DayCapacityScore } from "../../scheduling/capacityScore";

// Sperre für Kalender-Tausch: erledigte, übersprungene und vergangene Sessions sind weder Quelle noch Ziel.
// Fixtures wie in den Nachbar-Tests: Montag 10. Aug .. Sonntag 16. Aug 2026 (parseSessionDateLabel: Jahr 2026).

type DaySpec = { id: string; type: SessionType; date: string; day: string };

function buildWeek(specs: DaySpec[]): AiPlanWeek {
  const s: AiPlanSession[] = specs.map((spec) => ({
    id: spec.id,
    day: spec.day,
    date: spec.date,
    type: spec.type,
    title: spec.type,
    km: spec.type === "rest" ? 0 : 8,
  }));
  return { wn: 1, phase: "Base", label: "Woche 1", dates: "10.-16. Aug", km: 40, s };
}

const BASE_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "interval", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "rest", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

const HARMLESS_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "easy", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "rest", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "easy", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

/** Job-Block (Werktagsfenster 06:00–22:00) fast komplett belegt -> harte Session dort im Konflikt. */
function overloadedDay(dayOfWeek: number): RecurringScheduleBlock {
  return {
    id: `r-${dayOfWeek}`,
    title: "Job",
    category: "job",
    startTime: "06:00",
    endTime: "21:50",
    notes: null,
    source: "manual",
    isRecurring: true,
    dayOfWeek,
    recurrenceStartDate: null,
    recurrenceEndDate: null,
  };
}

afterEach(() => freezeTimeForTests(null));

describe("buildLockedSessionIds", () => {
  test("erledigt, übersprungen, Health-Lauf zugeordnet und vergangen sind gesperrt; offene heutige/künftige nicht", () => {
    freezeTimeForTests(new Date(2026, 7, 12, 9, 0)); // Mittwoch 12. Aug
    const week = buildWeek(BASE_WEEK);
    const logs = {
      "s-thu": { done: true },
      "s-fri": { skipped: true },
      "s-sat": { assignedRun: { runId: "run-1" } },
    };

    const locked = buildLockedSessionIds([week], logs);

    expect([...locked].sort()).toEqual(["s-fri", "s-mon", "s-sat", "s-thu", "s-tue"]);
    expect(locked.has("s-wed")).toBe(false); // heute, offen
    expect(locked.has("s-sun")).toBe(false); // Zukunft, offen
  });

  test("ohne Logs zählt nur das Datum", () => {
    const week = buildWeek(BASE_WEEK);
    expect([...buildLockedSessionIds([week], undefined, "2026-08-11")]).toEqual(["s-mon"]);
  });
});

describe("(a) gesperrte Session als Quelle", () => {
  test("scanWeekForCalendarConflicts: überlastete, aber gesperrte Session ist kein Konflikt", () => {
    const week = buildWeek(BASE_WEEK);
    const blocks = [overloadedDay(1)]; // Montag (Intervall) überlastet

    expect(scanWeekForCalendarConflicts(week, blocks).map((c) => c.sessionId)).toEqual(["s-mon"]);
    expect(scanWeekForCalendarConflicts(week, blocks, new Set(["s-mon"]))).toEqual([]);
  });

  test("vergangene Session (Datum < heute) wird über buildLockedSessionIds nie zur Quelle", () => {
    freezeTimeForTests(new Date(2026, 7, 12, 9, 0));
    const week = buildWeek(BASE_WEEK);
    const locked = buildLockedSessionIds([week], {});
    // Montag (vergangen) und Mittwoch (heute) überlastet: nur Mittwoch bleibt Konflikt.
    const conflicts = scanWeekForCalendarConflicts(week, [overloadedDay(1), overloadedDay(3)], locked);
    expect(conflicts.map((c) => c.sessionId)).toEqual(["s-wed"]);
  });

  test("erledigte und übersprungene Sessions sind nie Quelle", () => {
    const week = buildWeek(BASE_WEEK);
    const locked = buildLockedSessionIds([week], { "s-mon": { done: true }, "s-wed": { skipped: true } }, "2026-01-01");
    expect(scanWeekForCalendarConflicts(week, [overloadedDay(1), overloadedDay(3)], locked)).toEqual([]);
  });
});

describe("(a) gesperrte Session als Ziel", () => {
  test("buildCalendarReassignmentCandidates: gesperrte Sessions sind nie Kandidat", () => {
    const week = buildWeek(BASE_WEEK);
    const all = buildCalendarReassignmentCandidates(week, "s-wed", []).map((c) => c.targetSessionId);
    expect(all).toEqual(expect.arrayContaining(["s-mon", "s-tue", "s-thu"]));

    const locked = new Set(["s-mon", "s-tue", "s-thu"]);
    const filtered = buildCalendarReassignmentCandidates(week, "s-wed", [], locked).map((c) => c.targetSessionId);
    expect(filtered.sort()).toEqual(["s-fri", "s-sat", "s-sun"]);
  });

  test("proposeWeekCalendarReassignments: sind alle anderen Tage gesperrt, bleibt der Konflikt unresolved", () => {
    const week = buildWeek(BASE_WEEK);
    const blocks = [overloadedDay(3)]; // Mittwoch (Intervall) überlastet
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    const locked = new Set(week.s.filter((s) => s.id !== "s-wed").map((s) => s.id));

    const proposals = proposeWeekCalendarReassignments(conflicts, week, blocks, locked);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ sessionId: "s-wed", unresolved: true });
  });

  test("proposeWeekCalendarReassignments: Zieltag ist nie ein gesperrter Tag", () => {
    const week = buildWeek(HARMLESS_WEEK);
    const blocks = [overloadedDay(1)]; // Montag (Intervall) überlastet
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    const locked = new Set(["s-tue", "s-wed", "s-thu"]); // Di–Do gesperrt

    const lockedDays = ["2026-08-11", "2026-08-12", "2026-08-13"];
    const resolvedDays = (proposals: WeekCalendarReassignmentProposal[]) =>
      proposals.flatMap((p) => ("toDayIso" in p ? [p.toDayIso] : []));

    // Kontrolle: ohne Sperre wird ein Tag aus Di–Do gewählt (sonst wäre der Test vakuös).
    expect(lockedDays).toContain(resolvedDays(proposeWeekCalendarReassignments(conflicts, week, blocks))[0]);

    const resolved = resolvedDays(proposeWeekCalendarReassignments(conflicts, week, blocks, locked));
    expect(resolved).toHaveLength(1);
    expect(lockedDays).not.toContain(resolved[0]);
  });
});

describe("(b) Guard-Violation bei gesperrter ID", () => {
  test("assignSessionToChosenDay: gesperrte Quelle -> locked-session, keine Patches", () => {
    const plan = [buildWeek(BASE_WEEK)];
    const result = assignSessionToChosenDay(plan, "s-tue", "s-thu", undefined, new Set(["s-tue"]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("locked-session");
    expect(result.patches).toEqual([]);
  });

  test("assignSessionToChosenDay: gesperrtes Ziel -> locked-session, keine Patches", () => {
    const plan = [buildWeek(BASE_WEEK)];
    const result = assignSessionToChosenDay(plan, "s-tue", "s-thu", undefined, new Set(["s-thu"]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("locked-session");
    expect(result.patches).toEqual([]);
  });

  test("assignSessionToChosenDay: ohne Sperre unverändert (Kontrolle)", () => {
    const plan = [buildWeek(BASE_WEEK)];
    expect(assignSessionToChosenDay(plan, "s-tue", "s-thu").ok).toBe(true);
    expect(assignSessionToChosenDay(plan, "s-tue", "s-thu", undefined, new Set(["s-mon"])).ok).toBe(true);
  });

  const proposal: WeekCalendarReassignmentProposal = {
    sessionId: "s-tue",
    fromDayIso: "2026-08-11",
    toDayIso: "2026-08-14",
    reason: "Ausweichtag gefunden.",
  };

  test("validateWeekReassignmentBatch: gesperrte Quelle -> Violation, Batch ungültig", () => {
    const result = validateWeekReassignmentBatch([proposal], buildWeek(HARMLESS_WEEK), undefined, new Set(["s-tue"]));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain("s-tue");
      expect(result.violations[0]).toContain("erledigt, übersprungen oder vergangen");
      expect(result.patches).toEqual([]);
    }
  });

  test("validateWeekReassignmentBatch: gesperrtes Ziel (Session auf toDayIso) -> Violation, keine Patches", () => {
    const result = validateWeekReassignmentBatch([proposal], buildWeek(HARMLESS_WEEK), undefined, new Set(["s-fri"]));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations[0]).toContain("s-fri");
      expect(result.patches).toEqual([]);
    }
  });

  test("validateWeekReassignmentBatch: ohne Sperre gültig (Kontrolle)", () => {
    expect(validateWeekReassignmentBatch([proposal], buildWeek(HARMLESS_WEEK)).valid).toBe(true);
  });
});

describe("(c) Einzel-Flow (📅-Button)", () => {
  test("isSessionInCalendarConflict: Schwelle MIN_FIT_SCORE_THRESHOLD (0,35), harte vs. leichte Session", () => {
    const day = (capacityScore: number): DayCapacityScore => ({
      dateIso: "2026-08-10",
      isWeekend: false,
      windowMinutes: 960,
      busyMinutes: Math.round((1 - capacityScore) * 960),
      freeMinutes: Math.round(capacityScore * 960),
      capacityScore,
      isFullyBooked: capacityScore === 0,
      isFullyFree: capacityScore === 1,
      physicalLoadBlockTitles: [],
    });
    expect(isSessionInCalendarConflict({ type: "interval" }, day(0.34))).toBe(true);
    expect(isSessionInCalendarConflict({ type: "interval" }, day(0.35))).toBe(false);
    expect(isSessionInCalendarConflict({ type: "easy" }, day(0))).toBe(false);
  });

  test("ohne Konflikt: kein Tauschvorschlag, aber Kandidaten für die manuelle Tageswahl", () => {
    const week = buildWeek(BASE_WEEK);
    const blocks = [overloadedDay(4)]; // Donnerstag belegt, Montag (Intervall) frei

    const result = proposeSingleSessionCalendarReassignment([week], week, "s-mon", blocks);

    expect(result.status).toBe("no-conflict");
    if (result.status === "no-conflict") {
      expect(result.candidates.length).toBeGreaterThan(0);
      // "Trotzdem Tag wählen" -> manuelle Auswahl bleibt anwendbar.
      const manual = assignSessionToChosenDay([week], "s-mon", result.candidates[0].targetSessionId);
      expect(manual.ok).toBe(true);
    }
  });

  test("leichte Session auf überlastetem Tag ist kein Konflikt -> no-conflict", () => {
    const week = buildWeek(BASE_WEEK);
    const result = proposeSingleSessionCalendarReassignment([week], week, "s-tue", [overloadedDay(2)]);
    expect(result.status).toBe("no-conflict");
  });

  test("mit Konflikt: Vorschlag wie bisher (Action + Patches + Kandidaten)", () => {
    const week = buildWeek(BASE_WEEK);
    const result = proposeSingleSessionCalendarReassignment([week], week, "s-mon", [overloadedDay(1)]);

    expect(result.status).toBe("proposal");
    if (result.status === "proposal") {
      expect(result.action?.type).toBe("reassign_session_to_calendar");
      expect(result.patches.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeGreaterThan(0);
    }
  });

  test("gesperrte Session -> locked, kein Vorschlag", () => {
    const week = buildWeek(BASE_WEEK);
    const result = proposeSingleSessionCalendarReassignment([week], week, "s-mon", [overloadedDay(1)], new Set(["s-mon"]));
    expect(result).toEqual({ status: "locked" });
  });

  test("gesperrte Sessions tauchen weder als Auto-Pick-Ziel noch in der manuellen Tageswahl auf", () => {
    const week = buildWeek(BASE_WEEK);
    const locked = new Set(["s-thu", "s-fri"]);
    const result = proposeSingleSessionCalendarReassignment([week], week, "s-mon", [overloadedDay(1)], locked);

    expect(result.status).toBe("proposal");
    if (result.status === "proposal") {
      expect(result.candidates.map((c) => c.label).join("|")).not.toMatch(/Donnerstag|Freitag/);
      for (const patch of result.patches) expect(locked.has(patch.sessionId)).toBe(false);
    }
  });
});
