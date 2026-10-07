import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock, ScheduleBlockCategory } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { classifyEventCategory } from "../../calendar/eventClassifier";
import { computeDayCapacityScore, computeSessionDayFitScore } from "../../scheduling/capacityScore";
import { proposeSingleSessionCalendarReassignment } from "./buildCalendarReassignmentAction";
import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";

/**
 * Akzeptanzfall Kalender-Tausch-Ausbau, Schritt 6 (`feat/event-load-semantics`):
 *
 * Sa 17.10.2026: Intervall, im Kalender „Sprint-Prüfung" 11–13 Uhr. So 18.10.: MP-Workout.
 * Vorher: kein Konflikt (14 von 16 Stunden frei, Fit 0,875) — der Termin zählte nur als Zeit.
 */

const FRIDAY = "2026-10-16";
const SATURDAY = "2026-10-17";

function session(id: string, day: string, date: string, dateIso: string, type: SessionType, title: string, km: number): AiPlanSession {
  return { id, day, date, dateIso, type, title, km };
}

function week(sunday: { type: SessionType; title: string }): AiPlanWeek {
  return {
    wn: 13,
    phase: "peak",
    label: "Woche 13",
    dates: "12.-18. Okt",
    km: 60,
    s: [
      session("w13-mo", "Mo", "12. Okt", "2026-10-12", "rest", "Ruhetag", 0),
      session("w13-di", "Di", "13. Okt", "2026-10-13", "easy", "Lockerer Dauerlauf", 10),
      session("w13-mi", "Mi", "14. Okt", "2026-10-14", "easy", "GA1-Dauerlauf", 12),
      session("w13-do", "Do", "15. Okt", "2026-10-15", "strength", "Krafttraining", 0),
      session("w13-fr", "Fr", "16. Okt", FRIDAY, "rest", "Ruhetag", 0),
      session("w13-sa", "Sa", "17. Okt", SATURDAY, "interval", "Intervall 6x1000m", 12),
      session("w13-so", "So", "18. Okt", "2026-10-18", sunday.type, sunday.title, 24),
    ],
  };
}

/** Block wie aus dem EventKit-Import: die Kategorie kommt aus dem echten Classifier. */
function importedBlock(title: string, specificDate = SATURDAY, startTime = "11:00", endTime = "13:00"): OneOffScheduleBlock {
  const category: ScheduleBlockCategory = classifyEventCategory(title, "");
  return { id: `b-${title}`, title, category, startTime, endTime, notes: null, source: "eventkit", isRecurring: false, specificDate };
}

const NOTHING_LOCKED = new Set<string>();

describe.each([
  ["MP-Workout als Long Run mit Renntempo-Anteil", { type: "long" as const, title: "MP-Workout 24 km" }],
  ["MP-Workout als Tempo-Einheit", { type: "tempo" as const, title: "MP-Workout 3x5 km" }],
])("Schritt 6 – Sa Intervall + Sprint-Prüfung 11–13 Uhr, So %s", (_label, sunday) => {
  const w = week(sunday);
  const blocks = [importedBlock("Sprint-Prüfung")];

  test("die Sprint-Prüfung bleibt Kategorie study, die Zeit allein wäre kein Konflikt", () => {
    expect(blocks[0].category).toBe("study");
    const saturday = computeDayCapacityScore(SATURDAY, blocks);
    expect(saturday.capacityScore).toBe(0.875);
    expect(saturday.physicalLoadBlockTitles).toEqual(["Sprint-Prüfung"]);
    expect(computeSessionDayFitScore({ type: "interval" }, saturday)).toBe(0.2);
  });

  test("Wochen-Scan: der Samstag ist Konflikt und nennt den Termin", () => {
    const conflicts = scanWeekForCalendarConflicts(w, blocks, NOTHING_LOCKED);
    expect(conflicts.map((c) => c.sessionId)).toEqual(["w13-sa"]);
    expect(conflicts[0].cause).toBe("wegen Sprint-Prüfung");
    expect(conflicts[0].conflictReason).toContain("Sprint-Prüfung");
  });

  test("📅 am Samstag: Vorschlag, und das Intervall bleibt nicht auf dem Samstag", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w13-sa", blocks, NOTHING_LOCKED);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    expect(result.conflictCause).toBe("wegen Sprint-Prüfung");
    const intervalPatch = result.patches.find((p) => p.sessionId === "w13-sa");
    expect(intervalPatch?.changes.dateIso).toBeDefined();
    expect(intervalPatch?.changes.dateIso).not.toBe(SATURDAY);
  });

  test("eine lockere Einheit am selben Samstag wäre kein Konflikt", () => {
    const easySaturday: AiPlanWeek = { ...w, s: w.s.map((s) => (s.id === "w13-sa" ? { ...s, type: "easy", title: "Lockerer Dauerlauf" } : s)) };
    expect(scanWeekForCalendarConflicts(easySaturday, blocks, NOTHING_LOCKED)).toEqual([]);
  });

  test.each(["Klausur", "Abgabe Hausarbeit"])("„%s\" zur selben Zeit belegt nur Zeit: kein Konflikt", (title) => {
    const studyBlocks = [importedBlock(title)];
    expect(scanWeekForCalendarConflicts(w, studyBlocks, NOTHING_LOCKED)).toEqual([]);
    expect(proposeSingleSessionCalendarReassignment([w], w, "w13-sa", studyBlocks, NOTHING_LOCKED).status).toBe("no-conflict");
  });
});
