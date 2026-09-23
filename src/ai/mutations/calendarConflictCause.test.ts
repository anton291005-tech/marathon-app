import { describeCalendarConflictCause } from "./assignSessionToBestCapacityDay";
import { buildCalendarReassignmentAction, proposeSingleSessionCalendarReassignment } from "./buildCalendarReassignmentAction";
import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";
import { proposeWeekCalendarReassignments, type WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import { validateWeekReassignmentBatch, type WeekReassignmentBatchResult } from "./validateWeekReassignmentBatch";
import { buildWeekCalendarReassignmentBatchAction } from "./buildWeekCalendarReassignmentBatchAction";
import { computeDayCapacityScore, type DayCapacityScore } from "../../scheduling/capacityScore";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";

type DaySpec = { id: string; type: SessionType; date: string; day: string; title: string };

// Montag 14. Sep 2026 .. Sonntag 20. Sep 2026 — Long Run am Sonntag.
const WEEK_SPECS: DaySpec[] = [
  { id: "s-mon", type: "easy", date: "14. Sep", day: "Montag", title: "Easy Run" },
  { id: "s-tue", type: "interval", date: "15. Sep", day: "Dienstag", title: "Intervalle" },
  { id: "s-wed", type: "easy", date: "16. Sep", day: "Mittwoch", title: "Easy Run" },
  { id: "s-thu", type: "easy", date: "17. Sep", day: "Donnerstag", title: "Easy Run" },
  { id: "s-fri", type: "rest", date: "18. Sep", day: "Freitag", title: "Ruhetag" },
  { id: "s-sat", type: "easy", date: "19. Sep", day: "Samstag", title: "Easy Run" },
  { id: "s-sun", type: "long", date: "20. Sep", day: "Sonntag", title: "Long Run" },
];

function buildWeek(): AiPlanWeek {
  const s: AiPlanSession[] = WEEK_SPECS.map((spec) => ({ ...spec, km: spec.type === "rest" ? 0 : 8 }));
  return { wn: 1, phase: "Base", label: "Woche 1", dates: "14.-20. Sep", km: 40, s };
}

function block(overrides: Partial<OneOffScheduleBlock>): OneOffScheduleBlock {
  return {
    id: "o1",
    title: "Termin",
    category: "other",
    startTime: "11:00",
    endTime: "19:00",
    notes: null,
    source: "manual",
    isRecurring: false,
    specificDate: "2026-09-20",
    ...overrides,
  };
}

const TOURNAMENT = block({ title: "Fußballturnier" });
/** Sonntag komplett belegt, Titel ohne Sport-Stichwort. */
const FULL_DAY_APPOINTMENT = block({ title: "Familienfeier", startTime: "06:00", endTime: "23:30" });

describe("describeCalendarConflictCause", () => {
  test("Sport-Stichwort im Titel -> Titel als Grund", () => {
    const capacity = computeDayCapacityScore("2026-09-20", [TOURNAMENT]);
    expect(describeCalendarConflictCause({ type: "long" }, capacity)).toBe("wegen Fußballturnier");
  });

  test("Kein Stichwort-Treffer -> generischer Grund", () => {
    const capacity = computeDayCapacityScore("2026-09-20", [FULL_DAY_APPOINTMENT]);
    expect(describeCalendarConflictCause({ type: "long" }, capacity)).toBe("wegen Kalendertermin");
  });

  test("Leerer Titel -> generischer Grund, kein Absturz", () => {
    const capacity: DayCapacityScore = {
      ...computeDayCapacityScore("2026-09-20", []),
      physicalLoadBlockTitles: ["   ", ""],
    };
    expect(describeCalendarConflictCause({ type: "long" }, capacity)).toBe("wegen Kalendertermin");
  });
});

describe("Einzel-Tag-📅: Grund im Vorschlag", () => {
  test("Stichwort-Treffer: Zeile der verschobenen Session nennt das Fußballturnier, die verdrängte nicht", () => {
    const week = buildWeek();
    const proposal = proposeSingleSessionCalendarReassignment([week], week, "s-sun", [TOURNAMENT]);

    expect(proposal.status).toBe("proposal");
    if (proposal.status !== "proposal") return;
    expect(proposal.conflictCause).toBe("wegen Fußballturnier");
    const items = proposal.action?.preview?.items ?? [];
    expect(items[0]).toMatch(/^Long Run: Sonntag → .+ – wegen Fußballturnier$/);
    expect(items.slice(1).some((item) => item.includes("wegen"))).toBe(false);
  });

  test("Ohne Stichwort-Treffer: generischer Grund", () => {
    const week = buildWeek();
    const proposal = proposeSingleSessionCalendarReassignment([week], week, "s-sun", [FULL_DAY_APPOINTMENT]);

    expect(proposal.status).toBe("proposal");
    if (proposal.status !== "proposal") return;
    expect(proposal.conflictCause).toBe("wegen Kalendertermin");
    expect(proposal.action?.preview?.items[0]).toMatch(/– wegen Kalendertermin$/);
  });

  test("Keine Alternative gefunden: action null, Grund trotzdem vorhanden", () => {
    const week = buildWeek();
    const everyDayBooked = WEEK_SPECS.map((spec, i) =>
      block({ id: `o${i}`, title: i === 6 ? "Fußballturnier" : "Termin", specificDate: `2026-09-${14 + i}`, startTime: "00:00", endTime: "23:59" }),
    );
    const proposal = proposeSingleSessionCalendarReassignment([week], week, "s-sun", everyDayBooked);

    expect(proposal.status).toBe("proposal");
    if (proposal.status !== "proposal") return;
    expect(proposal.action).toBeNull();
    expect(proposal.conflictCause).toBe("wegen Fußballturnier");
  });

  test("ohne conflictCause bleibt der Zeilentext unverändert", () => {
    const week = buildWeek();
    const action = buildCalendarReassignmentAction(
      "s-sun",
      {
        ok: true,
        plan: [week],
        patches: [{ sessionId: "s-sun", changes: { day: "Samstag", date: "19. Sep" } }],
        chosenTargetSessionId: "s-sat",
        microStructureSeverity: 0,
        warning: null,
      },
      [week],
    );
    expect(action?.preview?.items).toEqual(["Long Run: Sonntag → Samstag (19. Sep)"]);
  });
});

describe("Wochen-Batch: Grund im Diff-Screen", () => {
  function batchItems(blocks: OneOffScheduleBlock[]): string[] {
    const week = buildWeek();
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    const proposals = proposeWeekCalendarReassignments(conflicts, week, blocks);
    const validation = validateWeekReassignmentBatch(proposals, week);
    return buildWeekCalendarReassignmentBatchAction(proposals, validation, week)?.preview?.items ?? [];
  }

  test("Stichwort-Treffer: Quell-Zeile nennt das Fußballturnier, verdrängte Zeile nicht", () => {
    const items = batchItems([TOURNAMENT]);
    expect(items[0]).toMatch(/^Long Run: Sonntag → .+ – wegen Fußballturnier$/);
    expect(items.filter((item) => item.includes("wegen"))).toHaveLength(1);
  });

  test("Ohne Stichwort-Treffer: generischer Grund", () => {
    const items = batchItems([FULL_DAY_APPOINTMENT]);
    expect(items[0]).toMatch(/^Long Run: Sonntag → .+ – wegen Kalendertermin$/);
  });

  test("Ungelöste Konflikt-Session als verdrängte Session trägt keinen Grund", () => {
    const week = buildWeek();
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-sun", fromDayIso: "2026-09-20", toDayIso: "2026-09-19", reason: "", cause: "wegen Fußballturnier" },
      { sessionId: "s-sat", fromDayIso: "2026-09-19", unresolved: true, reason: "", cause: "wegen Kalendertermin" },
    ];
    const validation: WeekReassignmentBatchResult = {
      valid: true,
      patches: [
        { sessionId: "s-sun", changes: { day: "Samstag", date: "19. Sep" } },
        { sessionId: "s-sat", changes: { day: "Sonntag", date: "20. Sep" } },
      ],
    };
    const items = buildWeekCalendarReassignmentBatchAction(proposals, validation, week)?.preview?.items ?? [];
    expect(items[0]).toBe("Long Run: Sonntag → Samstag (19. Sep) – wegen Fußballturnier");
    expect(items[1]).toBe("Easy Run: Samstag → Sonntag (20. Sep)");
  });
});
