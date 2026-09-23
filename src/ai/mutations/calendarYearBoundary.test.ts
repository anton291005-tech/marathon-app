import { scanWeekForCalendarConflicts } from "./scanWeekForCalendarConflicts";
import { buildCalendarReassignmentCandidates } from "./buildCalendarReassignmentAction";
import { buildLockedSessionIds } from "./lockedSessions";
import { swapWorkouts } from "./swapWorkouts";
import { applyPlanPatches } from "../../lib/ai/actions";
import { deriveDisplayPlan } from "../../displayPlan/deriveDisplayPlan";
import type { AiPlanWeek, AiPlanSession, SessionType } from "../../lib/ai/types";
import type { TrainingPlanV2 } from "../../planV2/types";
import type { OneOffScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";

/**
 * Regression: die Kapazitäts-Kette leitete den Kalendertag einer Session aus dem jahrlosen
 * Anzeige-Label ("14. Mär") ab, wofür `parseSessionDateLabel` das Jahr auf den hartkodierten
 * Default 2026 riet. Ab 2027 wurden dadurch die Kalender-Blocks des falschen Jahres
 * nachgeschlagen, und eine Woche über den Jahreswechsel war grundsätzlich nicht auflösbar.
 * Das echte Jahr kommt jetzt über `dateIso` aus der TrainingPlanV2-SSOT.
 */

const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const DE_WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function fullDayBlock(specificDate: string, title = "Familienfeier"): OneOffScheduleBlock {
  return {
    id: `block-${specificDate}`,
    title,
    category: "other",
    startTime: "06:00",
    endTime: "23:30",
    notes: null,
    source: "manual",
    isRecurring: false,
    specificDate,
  };
}

/** Minimaler V2-Plan aus (dateIso, sessionType)-Paaren — geht durch die echte Display-Pipeline. */
function buildPlanV2(days: Array<{ dateIso: string; type: string }>): TrainingPlanV2 {
  const workouts = days.map((d, i) => ({
    id: `w-${i}`,
    dateIso: `${d.dateIso}T12:00:00.000Z`,
    sport: (d.type === "rest" ? "rest" : "run") as "rest" | "run",
    sessionType: d.type,
    title: d.type === "rest" ? "Ruhetag" : `Einheit ${i}`,
    km: d.type === "rest" ? 0 : 10,
  }));
  return {
    version: 2,
    workouts,
    weeks: [
      {
        startIso: days[0].dateIso,
        totalKm: workouts.reduce((a, w) => a + w.km, 0),
        workouts,
        meta: { wn: 1, phase: "build", label: "Woche 1" },
      },
    ],
  };
}

/** Woche direkt als AiPlanWeek (ohne V2-Pipeline), für die Swap-/Lock-Tests. */
function aiWeek(days: Array<{ id: string; dateIso: string; type: SessionType }>): AiPlanWeek {
  const s: AiPlanSession[] = days.map((d) => {
    const [y, m, dd] = d.dateIso.split("-").map((p) => Number.parseInt(p, 10));
    const date = new Date(y, m - 1, dd, 12, 0, 0, 0);
    return {
      id: d.id,
      day: DE_WEEKDAYS[date.getDay()],
      date: `${date.getDate()}. ${DE_MONTHS[date.getMonth()]}`,
      dateIso: d.dateIso,
      type: d.type,
      title: d.type === "rest" ? "Ruhetag" : `Einheit ${d.id}`,
      km: d.type === "rest" ? 0 : 10,
    };
  });
  return { wn: 1, phase: "build", label: "Woche 1", dates: "", km: 60, s };
}

/** Invariante: day/date/dateIso beschreiben denselben Kalendertag. */
function expectLabelMatchesIso(session: AiPlanSession): void {
  expect(session.dateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const [y, m, d] = (session.dateIso as string).split("-").map((p) => Number.parseInt(p, 10));
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  expect(session.date).toBe(`${date.getDate()}. ${DE_MONTHS[date.getMonth()]}`);
  expect(session.day).toBe(DE_WEEKDAYS[date.getDay()]);
}

describe("(a) Plan komplett in 2027", () => {
  // Mo 08.03.2027 .. So 14.03.2027, Long Run am Sonntag.
  const PLAN_2027 = buildPlanV2([
    { dateIso: "2027-03-08", type: "easy" },
    { dateIso: "2027-03-09", type: "interval" },
    { dateIso: "2027-03-10", type: "easy" },
    { dateIso: "2027-03-11", type: "rest" },
    { dateIso: "2027-03-12", type: "easy" },
    { dateIso: "2027-03-13", type: "easy" },
    { dateIso: "2027-03-14", type: "long" },
  ]);

  test("deriveDisplayPlan trägt dateIso mit dem echten Jahr bis in den AI-Plan", () => {
    const [week] = deriveDisplayPlan(PLAN_2027, []);
    expect(week.s).toHaveLength(7);
    for (const session of week.s) {
      expectLabelMatchesIso(session);
      expect(session.dateIso?.startsWith("2027-")).toBe(true);
    }
  });

  test("Konflikt wird im Jahr 2027 erkannt, nicht im geratenen Jahr 2026", () => {
    const [week] = deriveDisplayPlan(PLAN_2027, []);
    const conflicts = scanWeekForCalendarConflicts(week, [fullDayBlock("2027-03-14")]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dayIso).toBe("2027-03-14");
  });

  test("Block im alten Default-Jahr 2026 löst keinen Konflikt mehr aus", () => {
    const [week] = deriveDisplayPlan(PLAN_2027, []);
    // Vor dem Fix hätte der 2026er-Block gegriffen, weil das Label-Jahr auf 2026 geraten wurde.
    expect(scanWeekForCalendarConflicts(week, [fullDayBlock("2026-03-14")])).toEqual([]);
  });

  test("Kandidaten-Tage der Reassignment-Kette liegen ebenfalls in 2027", () => {
    const [week] = deriveDisplayPlan(PLAN_2027, []);
    const sunday = week.s.find((s) => s.dateIso === "2027-03-14") as AiPlanSession;
    const candidates = buildCalendarReassignmentCandidates(week, sunday.id, []);

    expect(candidates).toHaveLength(6);
    for (const candidate of candidates) {
      expect(candidate.capacity.dateIso.startsWith("2027-")).toBe(true);
    }
  });
});

describe("(b) Woche über den Jahreswechsel 2026 -> 2027", () => {
  // Mo 28.12.2026 .. So 03.01.2027 — Tage in beiden Jahren.
  const PLAN_TURN = buildPlanV2([
    { dateIso: "2026-12-28", type: "easy" },
    { dateIso: "2026-12-29", type: "interval" },
    { dateIso: "2026-12-30", type: "easy" },
    { dateIso: "2026-12-31", type: "rest" },
    { dateIso: "2027-01-01", type: "easy" },
    { dateIso: "2027-01-02", type: "long" },
    { dateIso: "2027-01-03", type: "easy" },
  ]);

  test("Woche enthält Tage aus beiden Jahren, Label und dateIso passen überall", () => {
    const [week] = deriveDisplayPlan(PLAN_TURN, []);
    const years = week.s.map((s) => s.dateIso?.slice(0, 4));

    expect(new Set(years)).toEqual(new Set(["2026", "2027"]));
    week.s.forEach(expectLabelMatchesIso);
  });

  test("Kalenderblock am 02.01.2027 wird genau am richtigen Tag als Konflikt erkannt", () => {
    const [week] = deriveDisplayPlan(PLAN_TURN, []);
    const conflicts = scanWeekForCalendarConflicts(week, [fullDayBlock("2027-01-02", "Fußballturnier")]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dayIso).toBe("2027-01-02");
    expect(conflicts[0].cause).toBe("wegen Fußballturnier");

    // Die Session am Zieltag ist tatsächlich der Long Run im neuen Jahr.
    const conflicted = week.s.find((s) => s.id === conflicts[0].sessionId) as AiPlanSession;
    expect(conflicted.type).toBe("long");
    expect(conflicted.date).toBe("2. Jan");
  });

  test("Gleicher Tag/Monat im alten Jahr (02.01.2026) trifft die Woche nicht", () => {
    const [week] = deriveDisplayPlan(PLAN_TURN, []);
    expect(scanWeekForCalendarConflicts(week, [fullDayBlock("2026-01-02")])).toEqual([]);
  });
});

describe("(c) Lock-Entscheidung über den Jahreswechsel", () => {
  const WEEK = aiWeek([
    { id: "s-2026-12-28", dateIso: "2026-12-28", type: "easy" },
    { id: "s-2027-01-02", dateIso: "2027-01-02", type: "long" },
  ]);

  test("2027-Session gilt an einem Tag in 2026 nicht als vergangen", () => {
    const locked = buildLockedSessionIds([WEEK], {}, "2026-12-30");

    expect(locked.has("s-2027-01-02")).toBe(false);
    // Gegenprobe: der Tag davor liegt wirklich in der Vergangenheit.
    expect(locked.has("s-2026-12-28")).toBe(true);
  });

  test("Ab einem Tag nach dem Jahreswechsel ist die 2027-Session gesperrt", () => {
    const locked = buildLockedSessionIds([WEEK], {}, "2027-01-03");

    expect(locked.has("s-2027-01-02")).toBe(true);
  });
});

describe("(d) Swap-Invariante über den Jahreswechsel", () => {
  test("So 27.12.2026 <-> Sa 02.01.2027: Label und dateIso bleiben bei beiden Sessions konsistent", () => {
    const week = aiWeek([
      { id: "s-sun-2026", dateIso: "2026-12-27", type: "long" },
      { id: "s-sat-2027", dateIso: "2027-01-02", type: "easy" },
    ]);

    const [swapped] = swapWorkouts([week], "s-sun-2026", "s-sat-2027");
    const sun = swapped.s.find((s) => s.id === "s-sun-2026") as AiPlanSession;
    const sat = swapped.s.find((s) => s.id === "s-sat-2027") as AiPlanSession;

    // Die Tage sind getauscht ...
    expect(sun.dateIso).toBe("2027-01-02");
    expect(sat.dateIso).toBe("2026-12-27");

    // ... und zwar vollständig: Label, Wochentag und dateIso laufen nicht auseinander.
    expectLabelMatchesIso(sun);
    expectLabelMatchesIso(sat);
    expect(sun.date).toBe("2. Jan");
    expect(sun.day).toBe("Sa");
    expect(sat.date).toBe("27. Dez");
    expect(sat.day).toBe("So");
  });

  test("Nach dem Swap folgt der Kapazitäts-Lookup dem neuen Jahr", () => {
    const week = aiWeek([
      { id: "s-sun-2026", dateIso: "2026-12-27", type: "long" },
      { id: "s-sat-2027", dateIso: "2027-01-02", type: "easy" },
    ]);

    const [swapped] = swapWorkouts([week], "s-sun-2026", "s-sat-2027");
    const conflicts = scanWeekForCalendarConflicts(swapped, [fullDayBlock("2027-01-02")]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sessionId).toBe("s-sun-2026");
    expect(conflicts[0].dayIso).toBe("2027-01-02");
  });
});

describe("(d2) Invariante bei Patches ohne dateIso", () => {
  const WEEK = aiWeek([
    { id: "s-silvester", dateIso: "2026-12-31", type: "easy" },
    { id: "s-neujahr", dateIso: "2027-01-01", type: "rest" },
  ]);

  test("Label-only-Patch ueber den Jahreswechsel verankert dateIso im neuen Jahr", () => {
    // Ein Patch, der nur das jahrlose Label setzt (z.B. aus einer AI-Antwort) darf kein
    // veraltetes dateIso stehen lassen.
    const [patched] = applyPlanPatches([WEEK], [
      { sessionId: "s-silvester", changes: { day: "Sa", date: "2. Jan" } },
    ]);
    const moved = patched.s.find((s) => s.id === "s-silvester") as AiPlanSession;

    expect(moved.dateIso).toBe("2027-01-02");
    expectLabelMatchesIso(moved);
  });

  test("Label-only-Patch rueckwaerts ueber den Jahreswechsel bleibt im alten Jahr", () => {
    const [patched] = applyPlanPatches([WEEK], [
      { sessionId: "s-neujahr", changes: { day: "Di", date: "29. Dez" } },
    ]);
    const moved = patched.s.find((s) => s.id === "s-neujahr") as AiPlanSession;

    expect(moved.dateIso).toBe("2026-12-29");
    expectLabelMatchesIso(moved);
  });

  test("Unparsebares Label laesst kein veraltetes dateIso zurueck", () => {
    const [patched] = applyPlanPatches([WEEK], [
      { sessionId: "s-silvester", changes: { date: "" } },
    ]);
    const moved = patched.s.find((s) => s.id === "s-silvester") as AiPlanSession;

    expect(moved.dateIso).toBeUndefined();
  });
});
