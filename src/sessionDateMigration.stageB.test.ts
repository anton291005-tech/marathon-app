// Regression Stufe B (Client-Coach-Kontext): Plan Sa 07.11.2026 → So 28.02.2027. Das Label ("5. Jan") hat kein
// Jahr; Label+festes Jahr 2026 ergab ein falsches Rennjahr (raceDateIso 2026-02-28 statt 2027-02-28), eine
// leere "nächste 14 Tage"-Liste ab Januar und falsch sortierte Sessions. `dateIso` trägt das Jahr.

import { getAiContext, sortAiPlanSessionsByCalendar } from "./lib/ai/getAiContext";
import { buildCoachRuntimeSnapshot } from "./lib/ai/coachRuntimeSnapshot";
import { calendarIsoFromSession, findClosestSessionByType } from "./lib/ai/buildReplacementWorkout";
import { applyPlanPatches } from "./lib/ai/actions";
import { toAiPlanWeeks } from "./lib/ai/planToAi";
import { sessionDayIso } from "./ai/mutations/sessionDayIso";
import { validatePlanIntegrity } from "./ai/validation/validatePlanIntegrity";
import { buildYearBoundaryPlan, sessionForYmd } from "./testSupport/yearBoundaryPlan";

const aiPlan = (() => {
  const weeks = buildYearBoundaryPlan();
  // Letzte Session ist das Rennen.
  weeks[weeks.length - 1].s[weeks[weeks.length - 1].s.length - 1].type = "race";
  return toAiPlanWeeks(weeks);
})();
const flat = aiPlan.flatMap((w) => w.s);
const at = (iso: string) => new Date(`${iso}T10:00:00+01:00`);

function ctx(nowIso: string) {
  return getAiContext({ plan: aiPlan, logs: {}, now: at(nowIso), targetTime: "3:59:00", availableScreens: [] } as never);
}

describe("Stufe B — getAiContext über Neujahr", () => {
  test("raceDateIso ist der 28.02.2027, nicht der 28.02.2026", () => {
    expect(ctx("2026-11-08").raceDateIso).toMatch(/^2027-02-28T/);
  });

  test("next14Days am 28.12.2026 reicht über Neujahr (28.12.–10.01.)", () => {
    const days = ctx("2026-12-28").next14Days.map((s) => s.dateIso);
    expect(days[0]).toBe("2026-12-28");
    expect(days[days.length - 1]).toBe("2027-01-10");
    expect(days).toHaveLength(14);
  });

  test("next14Days am 05.01.2027 beginnt am 05.01.2027", () => {
    const days = ctx("2027-01-05").next14Days.map((s) => s.dateIso);
    expect(days[0]).toBe("2027-01-05");
    expect(days[days.length - 1]).toBe("2027-01-18");
  });

  test("sortAiPlanSessionsByCalendar ordnet Januar 2027 hinter Dezember 2026", () => {
    const shuffled = [sessionForYmd("2027-01-02"), sessionForYmd("2026-12-30"), sessionForYmd("2027-01-01")];
    expect(sortAiPlanSessionsByCalendar(shuffled as never).map((s) => s.dateIso)).toEqual([
      "2026-12-30",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
});

describe("Stufe B — Laufzeit-Snapshot des Coaches", () => {
  test("nextSessions am 03.01.2027 nennen den Kalendertag samt Jahr", () => {
    const snap = buildCoachRuntimeSnapshot({
      now: at("2027-01-03"),
      platform: "ios" as never,
      plan: aiPlan,
      logs: {},
      healthRuns: [],
      preferences: {},
      raceDateIso: "2027-02-28",
      appleHealthConnected: false,
      healthKitAvailable: null,
    });
    expect(snap.planSummary.nextSessions.map((s) => s.dateIso)).toEqual([
      "2027-01-03",
      "2027-01-04",
      "2027-01-05",
      "2027-01-06",
      "2027-01-07",
      "2027-01-08",
    ]);
  });
});

describe("Stufe B — Kalendertag-Helfer des Coaches", () => {
  test("calendarIsoFromSession / sessionDayIso liefern das Jahr aus dateIso", () => {
    expect(calendarIsoFromSession(sessionForYmd("2027-01-05") as never)).toBe("2027-01-05");
    expect(sessionDayIso(sessionForYmd("2027-01-05") as never)).toBe("2027-01-05");
  });

  test("findClosestSessionByType sucht ab 04.01.2027 die nächste Session im neuen Jahr", () => {
    const hit = findClosestSessionByType(aiPlan, "easy", "2027-01-04");
    expect(hit?.dateIso).toBe("2027-01-04");
  });

  test("Plan-Patch 31. Dez → 2. Jan verankert dateIso im neuen Jahr", () => {
    const patched = applyPlanPatches(aiPlan, [{ sessionId: "s-2026-12-31", changes: { date: "2. Jan" } }] as never);
    const s = patched.flatMap((w) => w.s).find((x) => x.id === "s-2026-12-31");
    expect(s?.dateIso).toBe("2027-01-02");
  });

  test("validatePlanIntegrity akzeptiert den Plan über Neujahr", () => {
    expect(validatePlanIntegrity(aiPlan)).toBe(true);
    expect(flat.length).toBe(114);
  });
});
