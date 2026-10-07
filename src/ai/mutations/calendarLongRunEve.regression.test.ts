import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { proposeSingleSessionCalendarReassignment } from "./buildCalendarReassignmentAction";

/**
 * Regression: Testfall aus docs/calendar-system-analysis.md, Abschnitt 2.1.
 *
 * Di: Bahnintervalle, im Kalender „Sprint-Prüfung" 08–14 Uhr + „Arbeit" 16–22 Uhr → Konflikt.
 * Sa: Krafttraining, frei. So: Marathon-Pace-Long-Run 28 km, frei.
 *
 * Fehler damals: Die Engine schlug „Intervall Di → Sa" vor (Schweregrad 0, keine Warnung), weil der
 * Validator den Long Run als „low" sah. Ein Intervall am Samstag liegt direkt vor dem Long Run.
 */

const SATURDAY = "2026-10-10";

function session(id: string, day: string, date: string, dateIso: string, type: SessionType, title: string, km: number): AiPlanSession {
  return { id, day, date, dateIso, type, title, km };
}

function week(sunday: { type: SessionType; title: string }): AiPlanWeek {
  return {
    wn: 12,
    phase: "peak",
    label: "Woche 12",
    dates: "5.-11. Okt",
    km: 62,
    s: [
      session("w12-mo", "Mo", "5. Okt", "2026-10-05", "rest", "Ruhetag", 0),
      session("w12-di", "Di", "6. Okt", "2026-10-06", "interval", "Bahnintervalle 6x1000m", 12),
      session("w12-mi", "Mi", "7. Okt", "2026-10-07", "easy", "Lockerer Dauerlauf", 10),
      session("w12-do", "Do", "8. Okt", "2026-10-08", "easy", "GA1-Dauerlauf", 12),
      session("w12-fr", "Fr", "9. Okt", "2026-10-09", "rest", "Ruhetag", 0),
      session("w12-sa", "Sa", "10. Okt", SATURDAY, "strength", "Krafttraining", 0),
      session("w12-so", "So", "11. Okt", "2026-10-11", sunday.type, sunday.title, 28),
    ],
  };
}

function block(id: string, title: string, specificDate: string, startTime: string, endTime: string): OneOffScheduleBlock {
  return { id, title, category: "other", startTime, endTime, notes: null, source: "eventkit", isRecurring: false, specificDate };
}

const BLOCKS = [
  block("b1", "Sprint-Prüfung", "2026-10-06", "08:00", "14:00"),
  block("b2", "Arbeit", "2026-10-06", "16:00", "22:00"),
  block("b3", "Arbeit", "2026-10-07", "09:00", "17:00"),
  block("b4", "Arbeit", "2026-10-08", "09:00", "17:00"),
  block("b5", "Arbeit", "2026-10-09", "09:00", "17:00"),
];

const LOCKED = new Set(["w12-mo"]); // Montag ist vergangen

describe.each([
  ["Marathon-Pace-Long-Run (Titel mit Renntempo-Anteil)", { type: "long" as const, title: "Marathon-Pace-Long-Run 28 km" }],
  ["Long Run ohne Renntempo-Hinweis", { type: "long" as const, title: "Long Run W12" }],
])("Regression 2.1 – %s", (_label, sunday) => {
  const w = week(sunday);

  test("Konflikt am Dienstag wird erkannt und es kommt ein Vorschlag", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", BLOCKS, LOCKED);
    expect(result.status).toBe("proposal");
  });

  test("das Intervall wird NICHT auf den Samstag (Vortag des Long Runs) gelegt", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", BLOCKS, LOCKED);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;

    expect(result.action).not.toBeNull();
    const intervalPatch = result.patches.find((p) => p.sessionId === "w12-di");
    expect(intervalPatch).toBeDefined();
    expect(intervalPatch?.changes.dateIso).toBeDefined();
    expect(intervalPatch?.changes.dateIso).not.toBe(SATURDAY);
    expect(result.patches.some((p) => p.changes.dateIso === SATURDAY && p.sessionId === "w12-di")).toBe(false);
    // Auch die Vorschau-Zeilen nennen keinen Wechsel auf den Samstag.
    expect(result.action?.preview?.items.join(" | ")).not.toMatch(/→ Sa\b/);
  });

  test("in der manuellen Tageswahl ist der Samstag als ungünstig markiert und nennt den Long Run", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", BLOCKS, LOCKED);
    if (result.status !== "proposal") throw new Error("Vorschlag erwartet");
    const sat = result.candidates.find((c) => c.targetSessionId === "w12-sa");
    expect(sat).toBeDefined();
    expect(sat?.isConflict).toBe(true);
    expect(sat?.warningReason ?? "").toMatch(/Long Run|intensive/);
  });

  test("auch mit kurzen Terminen (kein Konflikt) steht der Samstag in der Tageswahl als ungünstig", () => {
    // „Klausur" statt „Sprint-Prüfung": belegt nur Zeit (Roadmap Kalender-Tausch-Ausbau, Schritt 6).
    const light = [block("b1", "Klausur", "2026-10-06", "10:00", "12:00"), block("b2", "Arbeit", "2026-10-06", "17:00", "22:00")];
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", light, LOCKED);
    expect(result.status).toBe("no-conflict");
    if (result.status !== "no-conflict") return;
    const sat = result.candidates.find((c) => c.targetSessionId === "w12-sa");
    expect(sat?.isConflict).toBe(true);
    expect(result.candidates[0].targetSessionId).not.toBe("w12-sa");
  });

  test("kurze Sprint-Prüfung ist ein Konflikt für das Intervall (körperlicher Termin), Vorschlag meidet den Samstag", () => {
    const light = [block("b1", "Sprint-Prüfung", "2026-10-06", "10:00", "12:00"), block("b2", "Arbeit", "2026-10-06", "17:00", "22:00")];
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", light, LOCKED);
    expect(result.status).toBe("proposal");
    if (result.status !== "proposal") return;
    expect(result.conflictCause).toBe("wegen Sprint-Prüfung");
    const intervalPatch = result.patches.find((p) => p.sessionId === "w12-di");
    expect(intervalPatch?.changes.dateIso).toBeDefined();
    expect(intervalPatch?.changes.dateIso).not.toBe(SATURDAY);
  });

  test("mit der Sprint-Prüfung am Dienstag (körperlicher Termin) geht das Intervall auf den Donnerstag, nicht auf den Mittwoch danach", () => {
    const result = proposeSingleSessionCalendarReassignment([w], w, "w12-di", BLOCKS, LOCKED);
    if (result.status !== "proposal") throw new Error("Vorschlag erwartet");
    expect(result.patches.find((p) => p.sessionId === "w12-di")?.changes.dateIso).toBe("2026-10-08");
    expect(result.action?.preview?.items.join(" | ")).not.toContain("⚠️");
    expect(result.candidates.find((c) => c.targetSessionId === "w12-mi")?.isConflict).toBe(true);
    expect(result.candidates.find((c) => c.targetSessionId === "w12-mi")?.warningReason).toContain("am Tag nach „Sprint-Prüfung“");
  });
});
