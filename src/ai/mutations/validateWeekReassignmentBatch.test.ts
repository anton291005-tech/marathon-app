import { validateWeekReassignmentBatch } from "./validateWeekReassignmentBatch";
import type { WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";

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

// Montag 10. Aug 2026 .. Sonntag 16. Aug 2026 (parseSessionDateLabel defaults to Jahr 2026) — gleiches
// Muster wie assignSessionToBestCapacityDay.test.ts, für konsistente Fixtures.
const BASE_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "interval", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "rest", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

// Zwei harmlose easy/rest-Sessions, weit weg von den intensiven Tagen (Montag interval, Samstag long).
const HARMLESS_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "easy", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "rest", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "easy", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

// Zwei intensive Einheiten (Montag + Freitag, beide "interval" - normalizeTrainingPlan ordnet nur
// interval/race die Intensität "high" zu, "tempo" wird zu "medium", siehe normalizeIntensity in
// normalizeTrainingPlan.ts), jeweils 2 Tage von der Mitte (Mittwoch/Donnerstag) entfernt -> jede für
// sich verschoben landet neben zwei "easy"-Tagen (sicher, isoliert geprüft gegen den unveränderten
// Ist-Zustand, wie es rankCalendarReassignmentCandidates täte). Erst WENN BEIDE gleichzeitig angewendet
// werden, rutschen sie auf Mittwoch/Donnerstag direkt nebeneinander - eine Kombination, die keine der
// beiden Einzel-Prüfungen sehen kann, weil jede nur ihre eigene Verschiebung gegen die andere, dort
// noch unveränderte Hälfte der Woche simuliert.
const EMERGENT_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "easy", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "interval", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "easy", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

describe("validateWeekReassignmentBatch", () => {
  test("zwei unabhängige, harmlose Reassignments zusammen -> valid, beide Patch-Paare enthalten", () => {
    const week = buildWeek(HARMLESS_WEEK);
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-tue", fromDayIso: "2026-08-11", toDayIso: "2026-08-14", reason: "Ausweichtag gefunden." },
      { sessionId: "s-wed", fromDayIso: "2026-08-12", toDayIso: "2026-08-13", reason: "Ausweichtag gefunden." },
    ];

    const result = validateWeekReassignmentBatch(proposals, week);

    expect(result.valid).toBe(true);
    expect(result.patches).toHaveLength(4);
    const bySessionId = new Map(result.patches.map((p) => [p.sessionId, p.changes]));
    expect(bySessionId.get("s-tue")?.date).toBe("14. Aug");
    expect(bySessionId.get("s-fri")?.date).toBe("11. Aug");
    expect(bySessionId.get("s-wed")?.date).toBe("13. Aug");
    expect(bySessionId.get("s-thu")?.date).toBe("12. Aug");
  });

  test("ein Reassignment verletzt für sich allein schon Micro-Structure (Back-to-back, warn) -> valid mit Warnung", () => {
    const week = buildWeek(BASE_WEEK);
    // s-tue <-> s-mon: Intervall rutscht auf Dienstag, direkt neben Mittwochs-Intervall -> back-to-back.
    // validateMicroStructure liefert dafür "warn", nie "block" (Schritt 4: warn blockt das Batch nicht
    // mehr hart, siehe validateWeekReassignmentBatch.ts).
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-tue", fromDayIso: "2026-08-11", toDayIso: "2026-08-10", reason: "Ausweichtag gefunden." },
    ];

    const result = validateWeekReassignmentBatch(proposals, week);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warning).toEqual(expect.stringContaining("Back-to-back"));
      expect(result.patches.length).toBeGreaterThan(0);
    }
  });

  test("zwei für sich harmlose Reassignments brechen zusammen eine Spacing-Regel (Kernfall, warn) -> valid mit Warnung", () => {
    const week = buildWeek(EMERGENT_WEEK);
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-mon", fromDayIso: "2026-08-10", toDayIso: "2026-08-12", reason: "Ausweichtag gefunden." },
      { sessionId: "s-fri", fromDayIso: "2026-08-14", toDayIso: "2026-08-13", reason: "Ausweichtag gefunden." },
    ];

    const result = validateWeekReassignmentBatch(proposals, week);

    // Beide Patch-Paare wurden angewendet - Interaktionseffekt zwischen den beiden Swaps ergibt eine
    // Micro-Structure-Warnung (nicht sichtbar aus den Einzel-Swaps), blockt das Batch aber nicht mehr.
    expect(result.valid).toBe(true);
    expect(result.patches).toHaveLength(4);
    if (result.valid) {
      expect(result.warning).toBeTruthy();
    }
  });

  test("leeres resolved-Set -> valid mit leerem patches-Array", () => {
    const week = buildWeek(BASE_WEEK);
    const proposals: WeekCalendarReassignmentProposal[] = [
      { sessionId: "s-tue", fromDayIso: "2026-08-11", unresolved: true, reason: "Kein Ausweichtag gefunden." },
    ];

    const result = validateWeekReassignmentBatch(proposals, week);

    expect(result).toEqual({ valid: true, patches: [] });
  });

  test("Session ist gleichzeitig eigene Quelle und fremdes Verdrängungsziel -> batchInvalid, kein Teil-Apply", () => {
    const week = buildWeek(BASE_WEEK);
    const proposals: WeekCalendarReassignmentProposal[] = [
      // s-sun wird hier zum Verdrängungsziel von s-tue ...
      { sessionId: "s-tue", fromDayIso: "2026-08-11", toDayIso: "2026-08-16", reason: "Ausweichtag gefunden." },
      // ... ist aber gleichzeitig selbst Quelle eines eigenen Proposals -> widersprüchliche Zuordnung.
      { sessionId: "s-sun", fromDayIso: "2026-08-16", toDayIso: "2026-08-13", reason: "Ausweichtag gefunden." },
    ];

    const result = validateWeekReassignmentBatch(proposals, week);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.violations.join(" ")).toEqual(expect.stringContaining("s-sun"));
      // Nur das erste, unproblematische Paar wurde gebaut - das zweite, kollidierende Proposal wurde
      // verworfen statt teilweise angewendet zu werden (kein Patch für dessen Ziel s-thu).
      expect(result.patches).toHaveLength(2);
      expect(result.patches.some((p) => p.sessionId === "s-thu")).toBe(false);
    }
  });
});
