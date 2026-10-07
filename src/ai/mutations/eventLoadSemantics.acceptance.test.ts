import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock, ScheduleBlockCategory } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { classifyEventCategory } from "../../calendar/eventClassifier";
import { buildPhysicalLoadDayLookup, computeDayCapacityScore, computeSessionDayFitScore } from "../../scheduling/capacityScore";
import { assignSessionToChosenDay } from "./assignSessionToBestCapacityDay";
import { proposeSingleSessionCalendarReassignment } from "./buildCalendarReassignmentAction";
import { proposeWeekCalendarReassignments } from "./proposeWeekCalendarReassignments";
import { validateWeekReassignmentBatch } from "./validateWeekReassignmentBatch";
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

describe("Schritt 6 – Nachbarregel: harte Einheit am Tag vor oder nach einem körperlichen Termin", () => {
  const w = week({ type: "long", title: "MP-Workout 24 km" });
  const blocks = [importedBlock("Sprint-Prüfung")];

  test("der Vorschlag landet nicht auf dem Freitag (Vortag der Sprint-Prüfung) und kommt ohne ⚠️", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w13-sa", blocks, NOTHING_LOCKED);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    const intervalPatch = result.patches.find((p) => p.sessionId === "w13-sa");
    expect(intervalPatch?.changes.dateIso).toBeDefined();
    expect(intervalPatch?.changes.dateIso).not.toBe(FRIDAY);
    expect(intervalPatch?.changes.dateIso).not.toBe("2026-10-18");
    // Das MP-Workout am Sonntag nach der Sprint-Prüfung ist Bestand, kein neuer Befund des Tauschs.
    expect(result.action?.preview?.items.join(" | ")).not.toContain("⚠️");
  });

  test("Tageswahl: Freitag ist als ungünstig markiert, die übrigen freien Tage nicht", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w13-sa", blocks, NOTHING_LOCKED);
    if (result.status !== "proposal") throw new Error("Vorschlag erwartet");
    const byId = new Map(result.candidates.map((c) => [c.targetSessionId, c]));
    expect(byId.get("w13-fr")?.isConflict).toBe(true);
    expect(byId.get("w13-fr")?.warningReason ?? "").toMatch(/körperlich belastenden Termin/);
    for (const id of ["w13-mo", "w13-di", "w13-mi", "w13-do"]) {
      expect(byId.get(id)?.isConflict).toBe(false);
      expect(byId.get(id)?.warningReason).toBeNull();
    }
    // Rangfolge: Freitag steht hinter allen unbelasteten Tagen.
    const order = result.candidates.map((c) => c.targetSessionId);
    expect(order.indexOf("w13-fr")).toBeGreaterThan(order.indexOf("w13-do"));
  });

  test("ohne den Termin ist der Freitag ein normaler Kandidat (Gegenprobe)", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w13-sa", [importedBlock("Klausur")], NOTHING_LOCKED);
    if (result.status !== "no-conflict") throw new Error("kein Konflikt erwartet");
    expect(result.candidates.find((c) => c.targetSessionId === "w13-fr")?.isConflict).toBe(false);
  });

  test("Wochen-Vorschlag: der Samstag wird aufgelöst, aber nicht auf den Freitag", () => {
    const conflicts = scanWeekForCalendarConflicts(w, blocks, NOTHING_LOCKED);
    const proposals = proposeWeekCalendarReassignments(conflicts, w, blocks, NOTHING_LOCKED, [w]);
    const sa = proposals.find((p) => p.sessionId === "w13-sa");
    expect(sa && "toDayIso" in sa ? sa.toDayIso : null).not.toBeNull();
    expect(sa && "toDayIso" in sa ? sa.toDayIso : null).not.toBe(FRIDAY);
    const batch = validateWeekReassignmentBatch(proposals, w, undefined, NOTHING_LOCKED, [w], buildPhysicalLoadDayLookup(blocks));
    expect(batch.valid).toBe(true);
    if (batch.valid) expect(batch.warning).toBeUndefined();
  });

  describe("Mo–Do vergangen: nur noch Freitag und Sonntag stehen zur Wahl", () => {
    const locked = new Set(["w13-mo", "w13-di", "w13-mi", "w13-do"]);

    test("📅 schlägt den Freitag höchstens mit ⚠️-Warnung vor (Stufe 2, wie jede Warnung ab 75)", () => {
      const result = proposeSingleSessionCalendarReassignment([w], w, "w13-sa", blocks, locked);
      if (result.status !== "proposal") throw new Error("Vorschlag erwartet");
      expect(result.patches.find((p) => p.sessionId === "w13-sa")?.changes.dateIso).toBe(FRIDAY);
      expect(result.action?.preview?.items.join(" | ")).toMatch(/⚠️.*körperlich belastenden Termin/);
    });

    test("der Wochen-Vorschlag löst den Samstag dann nicht automatisch auf", () => {
      const conflicts = scanWeekForCalendarConflicts(w, blocks, locked);
      const proposals = proposeWeekCalendarReassignments(conflicts, w, blocks, locked, [w]);
      expect(proposals).toHaveLength(1);
      expect("unresolved" in proposals[0]).toBe(true);
    });
  });

  test("manuelle Tageswahl auf den Freitag liefert die Warnung mit", () => {
    const withLookup = assignSessionToChosenDay([w], "w13-sa", "w13-fr", undefined, NOTHING_LOCKED, buildPhysicalLoadDayLookup(blocks));
    expect(withLookup.ok).toBe(true);
    expect(withLookup.microStructureDeltaSeverity).toBe(75);
    expect(withLookup.warning ?? "").toMatch(/körperlich belastenden Termin/);
  });
});
