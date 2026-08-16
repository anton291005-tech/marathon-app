import { assignSessionToBestCapacityDay, type SessionAssignmentCandidate } from "./assignSessionToBestCapacityDay";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { DayCapacityScore } from "../../scheduling/capacityScore";

type DaySpec = { id: string; type: SessionType; date: string; day: string };

function buildPlan(specs: DaySpec[]): AiPlanWeek[] {
  const s: AiPlanSession[] = specs.map((spec) => ({
    id: spec.id,
    day: spec.day,
    date: spec.date,
    type: spec.type,
    title: spec.type,
    km: spec.type === "rest" ? 0 : 8,
  }));
  return [{ wn: 1, phase: "Base", label: "Woche 1", dates: "10.-16. Aug", km: 40, s }];
}

function capacity(dateIso: string, score: number): DayCapacityScore {
  return {
    dateIso,
    isWeekend: false,
    windowMinutes: 960,
    busyMinutes: Math.round((1 - score) * 960),
    freeMinutes: Math.round(score * 960),
    capacityScore: score,
    isFullyBooked: score === 0,
    isFullyFree: score === 1,
  };
}

// Montag 10. Aug 2026 .. Sonntag 16. Aug 2026 (parseSessionDateLabel defaults to Jahr 2026)
const BASE_WEEK: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "interval", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "rest", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "easy", date: "16. Aug", day: "Sonntag" },
];

// Variante mit Sonntag als zweiter Intervall-Einheit, für den "alle Kandidaten haben einen
// Konflikt"-Fall (Schritt 3 braucht zwei unterschiedlich schwere Konflikt-Kandidaten).
const BASE_WEEK_ALL_CONFLICT: DaySpec[] = [
  { id: "s-mon", type: "interval", date: "10. Aug", day: "Montag" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag" },
  { id: "s-wed", type: "interval", date: "12. Aug", day: "Mittwoch" },
  { id: "s-thu", type: "easy", date: "13. Aug", day: "Donnerstag" },
  { id: "s-fri", type: "rest", date: "14. Aug", day: "Freitag" },
  { id: "s-sat", type: "long", date: "15. Aug", day: "Samstag" },
  { id: "s-sun", type: "interval", date: "16. Aug", day: "Sonntag" },
];

describe("assignSessionToBestCapacityDay", () => {
  test("eindeutig bester Kandidat ohne Micro-Structure-Konflikt gewinnt", () => {
    const plan = buildPlan(BASE_WEEK);
    const candidates: SessionAssignmentCandidate[] = [
      { targetSessionId: "s-sun", capacity: capacity("2026-08-16", 0.9) },
      { targetSessionId: "s-thu", capacity: capacity("2026-08-13", 0.3) },
    ];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(true);
    expect(result.chosenTargetSessionId).toBe("s-sun");
    expect(result.microStructureSeverity).toBe(0);
    expect(result.warning).toBeNull();
  });

  test("Tie-Break bei gleichem Score und gleicher Capacity: früheres Datum gewinnt", () => {
    const plan = buildPlan(BASE_WEEK);
    const candidates: SessionAssignmentCandidate[] = [
      { targetSessionId: "s-thu", capacity: capacity("2026-08-13", 0.5) },
      { targetSessionId: "s-sun", capacity: capacity("2026-08-16", 0.5) },
    ];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.chosenTargetSessionId).toBe("s-thu");
  });

  test("Zieltag ist eine Rest-Session – Tausch funktioniert wie ein normaler Move", () => {
    const plan = buildPlan(BASE_WEEK);
    const candidates: SessionAssignmentCandidate[] = [{ targetSessionId: "s-fri", capacity: capacity("2026-08-14", 0.8) }];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(true);
    expect(result.chosenTargetSessionId).toBe("s-fri");
    const moved = result.plan[0].s.find((sess) => sess.id === "s-tue");
    const restSlot = result.plan[0].s.find((sess) => sess.id === "s-fri");
    expect(moved?.date).toBe("14. Aug");
    expect(restSlot?.date).toBe("11. Aug");
  });

  test("Kandidat mit besserem capacityScore aber Micro-Structure-Konflikt verliert gegen Kandidat mit niedrigerem Score ohne Konflikt", () => {
    const plan = buildPlan(BASE_WEEK);
    const candidates: SessionAssignmentCandidate[] = [
      // s-tue<->s-mon: verschiebt "interval" auf Dienstag, direkt neben Mittwochs-Intervall -> Konflikt
      { targetSessionId: "s-mon", capacity: capacity("2026-08-10", 0.9) },
      // s-tue<->s-sun: keine intensiven Nachbartage -> kein Konflikt
      { targetSessionId: "s-sun", capacity: capacity("2026-08-16", 0.4) },
    ];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(true);
    expect(result.chosenTargetSessionId).toBe("s-sun");
    expect(result.microStructureSeverity).toBe(0);
    expect(result.warning).toBeNull();
  });

  test("alle Kandidaten haben einen Konflikt: der am wenigsten schwere wird gewählt, Warnung wird ans Ergebnis angehängt", () => {
    const plan = buildPlan(BASE_WEEK_ALL_CONFLICT);
    const candidates: SessionAssignmentCandidate[] = [
      // s-tue<->s-wed: Intervall rutscht neben Montags-Intervall -> back-to-back (Severity 95)
      { targetSessionId: "s-wed", capacity: capacity("2026-08-12", 0.9) },
      // s-tue<->s-sat: Long Run rutscht neben Mittwochs-Intervall -> Spacing-Konflikt (Severity 92)
      { targetSessionId: "s-sat", capacity: capacity("2026-08-15", 0.5) },
    ];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(true);
    expect(result.chosenTargetSessionId).toBe("s-sat");
    expect(result.microStructureSeverity).toBe(92);
    expect(result.warning).toEqual(expect.stringContaining("Long Run"));
  });

  test("unbekannte Ziel-IDs werden ignoriert -> no-valid-candidates", () => {
    const plan = buildPlan(BASE_WEEK);
    const candidates: SessionAssignmentCandidate[] = [{ targetSessionId: "does-not-exist", capacity: capacity("2026-08-10", 0.9) }];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-valid-candidates");
    expect(result.plan).toEqual(plan);
  });

  test("keine Kandidaten übergeben -> no-candidates", () => {
    const plan = buildPlan(BASE_WEEK);
    const result = assignSessionToBestCapacityDay(plan, "s-tue", []);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-candidates");
  });

  test("strukturelle Integritätsverletzung im Plan erzwingt Rollback", () => {
    const plan = buildPlan(BASE_WEEK);
    plan[0].s.push({ ...plan[0].s[0] }); // dupliziert die id "s-mon" -> validatePlanIntegrity schlägt fehl
    const candidates: SessionAssignmentCandidate[] = [{ targetSessionId: "s-sun", capacity: capacity("2026-08-16", 0.9) }];
    const result = assignSessionToBestCapacityDay(plan, "s-tue", candidates);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("integrity-violation");
    expect(result.patches).toEqual([]);
  });

  test("Klick auf die easy Session eines überlasteten Tages darf den Tempodauerlauf nicht auf diesen Tag verdrängen", () => {
    // Montag = Uni+Gym (überlastet, capacityScore niedrig), Freitag = frei (capacityScore hoch).
    // Ohne Berücksichtigung der verdrängten Seite würde der Algorithmus den freien Freitag für die
    // geklickte easy Session wählen und dabei den Tempodauerlauf unbewertet auf Montag schieben.
    const plan = buildPlan([
      { id: "s-mon", type: "easy", date: "10. Aug", day: "Montag" },
      { id: "s-fri", type: "tempo", date: "14. Aug", day: "Freitag" },
    ]);
    const candidates: SessionAssignmentCandidate[] = [{ targetSessionId: "s-fri", capacity: capacity("2026-08-14", 0.9) }];
    const sourceDayCapacity = capacity("2026-08-10", 0.1);

    const result = assignSessionToBestCapacityDay(plan, "s-mon", candidates, sourceDayCapacity);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-good-fit-candidate");
    expect(result.patches).toEqual([]);
    const tempo = result.plan[0].s.find((sess) => sess.id === "s-fri");
    expect(tempo?.day).toBe("Freitag");
    expect(tempo?.date).toBe("14. Aug");
  });
});
