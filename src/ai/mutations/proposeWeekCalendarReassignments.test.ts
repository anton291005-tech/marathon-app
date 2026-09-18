import { proposeWeekCalendarReassignments } from "./proposeWeekCalendarReassignments";
import { scanWeekForCalendarConflicts, type WeeklyCalendarConflict } from "./scanWeekForCalendarConflicts";
import { buildCalendarReassignmentCandidates, computeSourceDayCapacity } from "./buildCalendarReassignmentAction";
import { rankCalendarReassignmentCandidates } from "./assignSessionToBestCapacityDay";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { OneOffScheduleBlock, RecurringScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";

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

// Zwei "tempo"-Konflikttage (Montag, Donnerstag), sonst nur "easy" -> keine Back-to-back-Intensity-
// Kollisionen beim Verschieben, damit sich die Kandidaten-Rankings der beiden Konflikte sauber per
// Kalender-Kapazität steuern lassen (verifiziert per Debug-Lauf gegen die echte Ranking-Engine).
const COMPETING_WEEK: DaySpec[] = [
  { id: "s-mon", type: "tempo", date: "10. Aug", day: "Montag", title: "Tempo" },
  { id: "s-tue", type: "easy", date: "11. Aug", day: "Dienstag", title: "Easy Run" },
  { id: "s-wed", type: "easy", date: "12. Aug", day: "Mittwoch", title: "Easy Run" },
  { id: "s-thu", type: "tempo", date: "13. Aug", day: "Donnerstag", title: "Tempo" },
  { id: "s-fri", type: "easy", date: "14. Aug", day: "Freitag", title: "Easy Run" },
  { id: "s-sat", type: "easy", date: "15. Aug", day: "Samstag", title: "Easy Run" },
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

describe("proposeWeekCalendarReassignments", () => {
  test("zwei Konflikte konkurrieren um denselben besten Zieltag -> zweite Session bekommt den naechstbesten, nicht den vergebenen", () => {
    const plan = buildPlan(COMPETING_WEEK);
    const week = plan[0];
    const blocks = [
      recurring({ id: "b-mon", dayOfWeek: 1, startTime: "06:00", endTime: "22:00" }), // Montag komplett belegt
      recurring({ id: "b-thu", dayOfWeek: 4, startTime: "06:00", endTime: "20:00" }), // Donnerstag stark belegt
      recurring({ id: "b-tue", dayOfWeek: 2, startTime: "06:00", endTime: "20:00" }), // übrige Ausweichtage bis auf Fr/Sa stark belegt,
      recurring({ id: "b-wed", dayOfWeek: 3, startTime: "06:00", endTime: "20:00" }), // damit Montag und Donnerstag beide eindeutig
      recurring({ id: "b-sun", dayOfWeek: 0, startTime: "06:00", endTime: "20:00" }), // denselben Top-Kandidaten (Samstag) wählen.
      recurring({ id: "b-fri", dayOfWeek: 5, startTime: "09:00", endTime: "11:00" }), // Freitag bleibt als zweitbester, konfliktfreier Ausweichtag.
    ];
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    expect(conflicts.map((c) => c.sessionId).sort()).toEqual(["s-mon", "s-thu"]);

    // Oracle: unabhängig voneinander (ohne Ausschluss) wählen sowohl Montag als auch Donnerstag
    // Samstag als besten, konfliktfreien Zieltag.
    const monCandidates = buildCalendarReassignmentCandidates(week, "s-mon", blocks);
    const monRankedUnfiltered = rankCalendarReassignmentCandidates([week], "s-mon", monCandidates, computeSourceDayCapacity(week, "s-mon", blocks));
    const thuCandidates = buildCalendarReassignmentCandidates(week, "s-thu", blocks);
    const thuRankedUnfiltered = rankCalendarReassignmentCandidates([week], "s-thu", thuCandidates, computeSourceDayCapacity(week, "s-thu", blocks));
    const monBestUnfiltered = monRankedUnfiltered.find((r) => !r.isConflict);
    const thuBestUnfiltered = thuRankedUnfiltered.find((r) => !r.isConflict);
    expect(monBestUnfiltered?.targetSessionId).toBe("s-sat");
    expect(thuBestUnfiltered?.targetSessionId).toBe("s-sat");
    expect(monBestUnfiltered?.dateIso).toBe(thuBestUnfiltered?.dateIso);

    // Montag ist der schwerere Konflikt (eigener Fit-Score 0 vs. Donnerstags 0.125) und wird zuerst
    // bedient -> bekommt Samstag. Donnerstag muss auf seinen zweitbesten Kandidaten ausweichen.
    const proposals = proposeWeekCalendarReassignments(conflicts, week, blocks);
    const monProposal = proposals.find((p) => p.sessionId === "s-mon");
    const thuProposal = proposals.find((p) => p.sessionId === "s-thu");

    expect(monProposal && "toDayIso" in monProposal ? monProposal.toDayIso : null).toBe(monBestUnfiltered?.dateIso);
    expect(thuProposal && "toDayIso" in thuProposal ? thuProposal.toDayIso : null).toBe("2026-08-14");
    expect(thuProposal && "toDayIso" in thuProposal ? thuProposal.toDayIso : null).not.toBe(monBestUnfiltered?.dateIso);
  });

  test("Konflikt ohne verbleibenden validen Zieltag -> unresolved, kein erzwungener Fallback", () => {
    const plan = buildPlan(BASE_WEEK);
    const week = plan[0];
    // Jeder Wochentag ist fast komplett durch Kalender-Termine belegt -> kein Ausweichtag erreicht die Fit-Schwelle.
    const blocks = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) =>
      recurring({ id: `job-${dayOfWeek}`, dayOfWeek, startTime: "06:00", endTime: "21:45" }),
    );
    const conflicts: WeeklyCalendarConflict[] = [
      { sessionId: "s-mon", dayIso: "2026-08-10", conflictReason: "Kalender-Termine belegen fast den ganzen Tag." },
    ];

    const proposals = proposeWeekCalendarReassignments(conflicts, week, blocks);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ sessionId: "s-mon", fromDayIso: "2026-08-10", unresolved: true });
    expect("toDayIso" in proposals[0]).toBe(false);
  });

  test("Konflikte werden in Schwere-Reihenfolge abgearbeitet, unabhaengig von der Eingabe-Reihenfolge", () => {
    const plan = buildPlan(BASE_WEEK);
    const week = plan[0];
    const blocks = [
      recurring({ id: "job-mon", dayOfWeek: 1, startTime: "06:00", endTime: "22:00" }), // Montag: Fit 0, am schwersten
      recurring({ id: "job-wed", dayOfWeek: 3, startTime: "06:00", endTime: "20:00" }), // Mittwoch: Fit > 0, weniger schwer
    ];
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    // Eingabe absichtlich in "falscher" Reihenfolge (Mittwoch vor Montag), um zu prüfen, dass die
    // Funktion selbst nach Schwere sortiert statt die Eingabe-Reihenfolge zu übernehmen.
    const reversedInput = [...conflicts].reverse();
    expect(reversedInput[0].sessionId).toBe("s-wed");

    const monCandidates = buildCalendarReassignmentCandidates(week, "s-mon", blocks);
    const monRanked = rankCalendarReassignmentCandidates([week], "s-mon", monCandidates, computeSourceDayCapacity(week, "s-mon", blocks));
    const expectedMonWinnerDateIso = monRanked.find((r) => !r.isConflict)?.dateIso;
    expect(expectedMonWinnerDateIso).toBeTruthy();

    const proposals = proposeWeekCalendarReassignments(reversedInput, week, blocks);
    const monProposal = proposals.find((p) => p.sessionId === "s-mon");
    const wedProposal = proposals.find((p) => p.sessionId === "s-wed");

    // Montag ist der schwerere Konflikt und muss trotz späterer Position in der Eingabe zuerst
    // bedient werden -> bekommt den Zieltag, den es auch unabhängig (ungefiltert) gewonnen hätte.
    expect(monProposal && "toDayIso" in monProposal ? monProposal.toDayIso : null).toBe(expectedMonWinnerDateIso);
    expect(wedProposal && "toDayIso" in wedProposal ? wedProposal.toDayIso : null).not.toBe(expectedMonWinnerDateIso);
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

describe("proposeWeekCalendarReassignments – körperliche Belastung", () => {
  test("Batch verschiebt den Long Run vom Fußballturnier-Sonntag auf einen anderen Tag", () => {
    const week = buildPlan(TOURNAMENT_WEEK)[0];
    const blocks = [sundayBlock("Fußballturnier")];
    const conflicts = scanWeekForCalendarConflicts(week, blocks);
    expect(conflicts.map((c) => c.sessionId)).toEqual(["s-sun"]);

    const proposals = proposeWeekCalendarReassignments(conflicts, week, blocks);
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0];
    expect("toDayIso" in proposal).toBe(true);
    if ("toDayIso" in proposal) {
      expect(proposal.fromDayIso).toBe("2026-09-20");
      expect(proposal.toDayIso).not.toBe("2026-09-20");
    }
  });

  test("Kandidaten-Ranking: der Belastungstag ist für harte Sessions nie Zieltag und immer als Konflikt markiert", () => {
    // Zwei Belastungstage: Sonntag (Long Run-Ursprung, Fußballturnier) und Mittwoch (Handball).
    const week = buildPlan(TOURNAMENT_WEEK)[0];
    const blocks = [
      sundayBlock("Fußballturnier"),
      oneOff({ id: "o-wed", title: "Handball", specificDate: "2026-09-16", startTime: "18:00", endTime: "20:00" }),
    ];
    const candidates = buildCalendarReassignmentCandidates(week, "s-sun", blocks);
    const ranked = rankCalendarReassignmentCandidates([week], "s-sun", candidates, computeSourceDayCapacity(week, "s-sun", blocks));

    const wed = ranked.find((r) => r.dateIso === "2026-09-16");
    expect(wed?.isConflict).toBe(true);
    expect(ranked.filter((r) => !r.isConflict).map((r) => r.dateIso)).not.toContain("2026-09-16");

    const proposals = proposeWeekCalendarReassignments(scanWeekForCalendarConflicts(week, blocks), week, blocks);
    const proposal = proposals.find((p) => p.sessionId === "s-sun");
    expect(proposal && "toDayIso" in proposal ? proposal.toDayIso : null).not.toBe("2026-09-16");
    expect(proposal && "toDayIso" in proposal ? proposal.toDayIso : null).toBeTruthy();
  });
});
