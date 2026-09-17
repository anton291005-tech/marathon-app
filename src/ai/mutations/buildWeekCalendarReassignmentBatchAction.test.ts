import { buildWeekCalendarReassignmentBatchAction } from "./buildWeekCalendarReassignmentBatchAction";
import type { WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import type { WeekReassignmentBatchResult } from "./validateWeekReassignmentBatch";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";

type DaySpec = { id: string; type: SessionType; date: string; day: string; title?: string };

function buildWeek(specs: DaySpec[]): AiPlanWeek {
  const s: AiPlanSession[] = specs.map((spec) => ({
    id: spec.id,
    day: spec.day,
    date: spec.date,
    type: spec.type,
    title: spec.title ?? spec.type,
    km: spec.type === "rest" ? 0 : 8,
  }));
  return { wn: 1, phase: "Base", label: "Woche 1", dates: "10.-16. Aug", km: 40, s };
}

const WEEK: AiPlanWeek = buildWeek([
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag", title: "Intervalle" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag", title: "Easy Run" },
  { id: "s-wed", type: "easy", date: "12. Aug", day: "Mittwoch", title: "Easy Run" },
]);

describe("buildWeekCalendarReassignmentBatchAction", () => {
  test("valides Batch mit Patches + Warnung -> Action mit Swap-Zeilen und Warn-Zeile", () => {
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-mon", fromDayIso: "2026-08-10", toDayIso: "2026-08-11", reason: "Ausweichtag gefunden." },
      { sessionId: "s-tue", fromDayIso: "2026-08-11", toDayIso: "2026-08-10", reason: "Ausweichtag gefunden." },
    ];
    const validation: WeekReassignmentBatchResult = {
      valid: true,
      patches: [
        { sessionId: "s-mon", changes: { day: "Dienstag", date: "11. Aug" } },
        { sessionId: "s-tue", changes: { day: "Montag", date: "10. Aug" } },
      ],
      warning: "Back-to-back intensity: zwei intensive Einheiten hintereinander.",
    };

    const action = buildWeekCalendarReassignmentBatchAction(proposals, validation, WEEK);

    expect(action).not.toBeNull();
    expect(action?.type).toBe("reassign_week_calendar_batch");
    expect(action?.preview?.items).toEqual([
      "Intervalle: Montag → Dienstag (11. Aug)",
      "Easy Run: Dienstag → Montag (10. Aug)",
      "⚠️ Back-to-back intensity: zwei intensive Einheiten hintereinander.",
    ]);
  });

  test("Batch mit unresolved-Rest -> Action enthält 'nicht automatisch lösbar'-Zeile", () => {
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-mon", fromDayIso: "2026-08-10", toDayIso: "2026-08-11", reason: "Ausweichtag gefunden." },
      { sessionId: "s-wed", fromDayIso: "2026-08-12", unresolved: true, reason: "Kein Ausweichtag gefunden." },
    ];
    const validation: WeekReassignmentBatchResult = {
      valid: true,
      patches: [{ sessionId: "s-mon", changes: { day: "Dienstag", date: "11. Aug" } }],
    };

    const action = buildWeekCalendarReassignmentBatchAction(proposals, validation, WEEK);

    expect(action).not.toBeNull();
    expect(action?.preview?.items).toContain("1 Konflikt nicht automatisch lösbar – einzeln über 📅 bearbeiten.");
  });

  test("geblockter Batch (valid: false) -> null", () => {
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-mon", fromDayIso: "2026-08-10", toDayIso: "2026-08-11", reason: "Ausweichtag gefunden." },
    ];
    const validation: WeekReassignmentBatchResult = {
      valid: false,
      patches: [],
      violations: ["Struktur-Integrität verletzt nach Anwendung aller Verschiebungen."],
    };

    expect(buildWeekCalendarReassignmentBatchAction(proposals, validation, WEEK)).toBeNull();
  });

  test("valides Batch ohne Patches (alles unresolved) -> null", () => {
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-mon", fromDayIso: "2026-08-10", unresolved: true, reason: "Kein Ausweichtag gefunden." },
    ];
    const validation: WeekReassignmentBatchResult = { valid: true, patches: [] };

    expect(buildWeekCalendarReassignmentBatchAction(proposals, validation, WEEK)).toBeNull();
  });
});
