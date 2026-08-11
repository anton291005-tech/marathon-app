import { buildCalendarReassignmentCandidates, buildCalendarReassignmentAction } from "./buildCalendarReassignmentAction";
import { assignSessionToBestCapacityDay } from "./assignSessionToBestCapacityDay";
import type { AiPlanWeek, AiPlanSession, SessionType, PlanPatch } from "../../lib/ai/types";
import type { SessionAssignmentResult } from "./assignSessionToBestCapacityDay";
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
    isRecurring: false,
    specificDate: "2026-08-10",
    ...overrides,
  };
}

describe("buildCalendarReassignmentCandidates", () => {
  test("baut einen Kandidaten pro anderer Session in der Woche, mit korrektem Capacity-Score", () => {
    const plan = buildPlan(BASE_WEEK);
    // Donnerstag (2026-08-13) komplett durch einen Job-Block belegt (Werktagsfenster 06:00-22:00 = 960min)
    const blocks = [recurring({ dayOfWeek: 4, startTime: "06:00", endTime: "22:00" })];
    const candidates = buildCalendarReassignmentCandidates(plan[0], "s-tue", blocks);

    expect(candidates.map((c) => c.targetSessionId).sort()).toEqual(
      ["s-fri", "s-mon", "s-sat", "s-sun", "s-thu", "s-wed"].sort(),
    );
    const thu = candidates.find((c) => c.targetSessionId === "s-thu");
    expect(thu?.capacity.dateIso).toBe("2026-08-13");
    expect(thu?.capacity.isFullyBooked).toBe(true);
    expect(thu?.capacity.capacityScore).toBe(0);
  });

  test("Session mit nicht parsbarem Datum wird übersprungen statt einen ungültigen Kandidaten zu erzeugen", () => {
    const plan = buildPlan([...BASE_WEEK.slice(0, 6), { id: "s-broken", type: "easy", date: "??", day: "Sonntag" }]);
    const candidates = buildCalendarReassignmentCandidates(plan[0], "s-tue", []);
    expect(candidates.some((c) => c.targetSessionId === "s-broken")).toBe(false);
  });
});

describe("buildCalendarReassignmentAction", () => {
  const beforePlan = buildPlan(BASE_WEEK);

  test("ok:false Ergebnis -> kein Vorschlag", () => {
    const result: SessionAssignmentResult = {
      ok: false,
      plan: beforePlan,
      patches: [],
      chosenTargetSessionId: null,
      microStructureSeverity: 0,
      warning: null,
      reason: "no-candidates",
    };
    expect(buildCalendarReassignmentAction("s-tue", result, beforePlan)).toBeNull();
  });

  test("erfolgreicher Tausch ohne Warnung -> preview.items zeigt beide verschobenen Sessions", () => {
    const patches: PlanPatch[] = [
      { sessionId: "s-tue", changes: { day: "Sonntag", date: "16. Aug" } },
      { sessionId: "s-sun", changes: { day: "Dienstag", date: "11. Aug" } },
    ];
    const result: SessionAssignmentResult = {
      ok: true,
      plan: beforePlan,
      patches,
      chosenTargetSessionId: "s-sun",
      microStructureSeverity: 0,
      warning: null,
    };
    const action = buildCalendarReassignmentAction("s-tue", result, beforePlan);
    expect(action?.type).toBe("reassign_session_to_calendar");
    expect(action?.payload).toEqual({ sessionId: "s-tue", targetSessionId: "s-sun" });
    expect(action?.preview?.items).toEqual([
      "Easy Run: Dienstag → Sonntag (16. Aug)",
      "Easy Run: Sonntag → Dienstag (11. Aug)",
    ]);
  });

  test("Warnung wird als zusätzliche Zeile angehängt, blockiert aber nicht", () => {
    const patches: PlanPatch[] = [{ sessionId: "s-tue", changes: { day: "Samstag", date: "15. Aug" } }];
    const result: SessionAssignmentResult = {
      ok: true,
      plan: beforePlan,
      patches,
      chosenTargetSessionId: "s-sat",
      microStructureSeverity: 92,
      warning: "Long Run zu nah an intensiver Einheit.",
    };
    const action = buildCalendarReassignmentAction("s-tue", result, beforePlan);
    expect(action?.preview?.items).toEqual([
      "Easy Run: Dienstag → Samstag (15. Aug)",
      "⚠️ Long Run zu nah an intensiver Einheit.",
    ]);
  });

  test("End-to-End mit echter Engine: Kandidat mit bestem Score ohne Konflikt gewinnt und ergibt eine gültige Action", () => {
    const plan = buildPlan(BASE_WEEK);
    // Mittwoch (2026-08-12) voll gebucht, Sonntag (2026-08-16) komplett frei
    const blocks = [oneOff({ specificDate: "2026-08-12", startTime: "06:00", endTime: "22:00" })];
    const candidates = buildCalendarReassignmentCandidates(plan[0], "s-thu", blocks);
    const result = assignSessionToBestCapacityDay(plan, "s-thu", candidates);
    const action = buildCalendarReassignmentAction("s-thu", result, plan);

    expect(result.ok).toBe(true);
    expect(action).not.toBeNull();
    expect(action?.preview?.title).toBe("Trainingstag an Kalender anpassen");
    expect(action?.preview?.confirmLabel).toBe("Übernehmen");
  });
});
