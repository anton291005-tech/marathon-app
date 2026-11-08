// Regression Stufe A (Display + Adherence): Plan Sa 07.11.2026 → So 28.02.2027. Das Label ("5. Jan") hat kein
// Jahr; Label+festes Jahr 2026 ließ „heute" (05.01.2027) auf keine Session treffen, ordnete Januar-Sessions dem
// Jahr 2026 zu (also „längst fällig") und verfälschte Adherence und Fortschritt. `dateIso` trägt das Jahr.

import {
  findPlanWeekContainingDate,
  getTodayNextSession,
  planEarliestSessionYmd,
  resolveCurrentPlanWeekIndex,
  sessionsScheduledOnCalendarDay,
} from "./appSmartFeatures";
import { computePlanAdherenceScore, computePlanDueSessionCounts, isSessionDueByYmd } from "./coach/adherenceScore";
import { freezeTimeForTests } from "./core/time/timeSystem";
import { rowHeadingForSession } from "./features/ai/SwapPreviewCard";
import { countPastTrainableSessions, flattenTrainableSessionsFromPlan } from "./lib/training/progressCalculation";
import { buildYearBoundaryPlan, sessionForYmd } from "./testSupport/yearBoundaryPlan";

const plan = buildYearBoundaryPlan();
const allSessions = plan.flatMap((w) => w.s);
const at = (iso: string) => new Date(`${iso}T10:00:00+01:00`);

afterEach(() => freezeTimeForTests(null));

describe("Stufe A — Heute-Session über Neujahr", () => {
  test("07.11.2026 (Planstart) → Heute-Session ist 7. Nov", () => {
    const res = getTodayNextSession(allSessions, {}, at("2026-11-07"));
    expect(res?.mode).toBe("today");
    expect(res?.session.dateIso).toBe("2026-11-07");
  });

  test("05.01.2027 → Heute-Session ist 5. Jan 2027, nicht „nächste offene“ aus dem Dezember", () => {
    const res = getTodayNextSession(allSessions, {}, at("2027-01-05"));
    expect(res?.mode).toBe("today");
    expect(res?.session.dateIso).toBe("2027-01-05");
  });

  test("28.02.2027 (Renntag) → Heute-Session ist 28. Feb 2027", () => {
    const res = getTodayNextSession(allSessions, {}, at("2027-02-28"));
    expect(res?.mode).toBe("today");
    expect(res?.session.dateIso).toBe("2027-02-28");
  });

  test("sessionsScheduledOnCalendarDay / findPlanWeekContainingDate treffen den 2027er Tag", () => {
    const day = new Date(2027, 0, 5);
    expect(sessionsScheduledOnCalendarDay(plan, day).map((s) => s.dateIso)).toEqual(["2027-01-05"]);
    const week = findPlanWeekContainingDate(plan, day);
    expect(week?.s.some((s) => s.dateIso === "2027-01-05")).toBe(true);
    // 5. Jan 2026 liegt nicht im Plan.
    expect(sessionsScheduledOnCalendarDay(plan, new Date(2026, 0, 5))).toEqual([]);
  });
});

describe("Stufe A — aktuelle Woche", () => {
  test("Planstart = 2026-11-07; Woche 1 am 07.11.2026, Woche 9 am 02.01.2027, letzte Woche am 28.02.2027", () => {
    expect(planEarliestSessionYmd(plan)).toBe("2026-11-07");
    expect(resolveCurrentPlanWeekIndex(plan, at("2026-11-07"))).toBe(0);
    expect(resolveCurrentPlanWeekIndex(plan, at("2027-01-02"))).toBe(8);
    expect(resolveCurrentPlanWeekIndex(plan, at("2027-02-28"))).toBe(plan.length - 1);
  });
});

describe("Stufe A — Adherence / Fälligkeit", () => {
  test("isSessionDueByYmd: Dezember 2026 und Januar 2027 sind am 10.01.2027 fällig, Februar 2027 nicht", () => {
    expect(isSessionDueByYmd(sessionForYmd("2026-12-20"), "2027-01-10")).toBe(true);
    expect(isSessionDueByYmd(sessionForYmd("2027-01-10"), "2027-01-10")).toBe(true);
    expect(isSessionDueByYmd(sessionForYmd("2027-01-11"), "2027-01-10")).toBe(false);
    expect(isSessionDueByYmd(sessionForYmd("2027-02-14"), "2027-01-10")).toBe(false);
  });

  test("Vor dem Planstart (01.11.2026) ist nichts fällig, auch wenn das Label „Jan“ 2026 meinen könnte", () => {
    const res = computePlanAdherenceScore({ plan, logs: {}, healthRuns: [], now: at("2026-11-01") });
    expect(res.dueTotal).toBe(0);
  });

  test("computePlanAdherenceScore zählt am 10.01.2027 genau die Sessions 07.11.2026 … 10.01.2027", () => {
    const logs = Object.fromEntries(allSessions.filter((s) => s.dateIso! <= "2026-12-31").map((s) => [s.id, { done: true }]));
    const res = computePlanAdherenceScore({ plan, logs, healthRuns: [], now: at("2027-01-10") });
    const expectedDue = allSessions.filter((s) => s.dateIso! <= "2027-01-10").length; // 65 Tage
    expect(res.dueTotal).toBe(expectedDue);
    expect(res.dueCompleted).toBe(allSessions.filter((s) => s.dateIso! <= "2026-12-31").length);
    expect(computePlanDueSessionCounts({ plan, logs }).total).toBe(allSessions.length);
  });

  test("Plan-Fortschritt: countPastTrainableSessions über Neujahr", () => {
    const trainable = flattenTrainableSessionsFromPlan(plan);
    expect(countPastTrainableSessions(trainable, "2026-12-31")).toBe(55); // 07.11.–31.12.2026
    expect(countPastTrainableSessions(trainable, "2027-01-10")).toBe(65);
    expect(countPastTrainableSessions(trainable, "2026-11-06")).toBe(0);
  });
});

describe("Stufe A — Anzeige", () => {
  test("rowHeadingForSession: „Heute“ / „Morgen“ / Wochentag mit echtem Jahr", () => {
    const ref = at("2027-01-05");
    expect(rowHeadingForSession(sessionForYmd("2027-01-05"), ref)).toBe("Heute");
    expect(rowHeadingForSession(sessionForYmd("2027-01-06"), ref)).toBe("Morgen");
    expect(rowHeadingForSession(sessionForYmd("2027-01-04"), ref)).toBe("Gestern");
    expect(rowHeadingForSession(sessionForYmd("2027-01-12"), ref)).toBe("Di 12. Jan");
    expect(rowHeadingForSession(undefined, ref)).toBe("Einheit");
  });
});
