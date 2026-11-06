import {
  berlinTodayYmd,
  coreDistanceOfKm,
  germanDateToYmd,
  goalSecondsOf,
  profileToCoreInputs,
} from "../../api/_lib/planCoreMapping";
import { planMetrics } from "../../api/_lib/planMetrics";
import { PROFILES } from "../planCore/__fixtures__/profiles";
import { randomInputs } from "../planCore/__fixtures__/randomInputs";
import { wizardProfileOf } from "../testSupport/planCoreComparison";

const { validatePlanBody } = require("../../api/_lib/inputLimits");

const TODAY = "2026-11-10";

/** Profil wie nach `validatePlanBody` (Schritt 9): Marathon, 4 Tage, Wettkampf. */
const profile = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  raceDistanceKm: 42.2,
  raceDistanceLabel: "Marathon (42,2 km)",
  raceGoal: "time",
  raceTargetTime: "3:59:00",
  weeklyKmRange: "20–40 km",
  raceDate: "18.04.2027",
  planStartDate: "16.11.2026",
  planDurationDays: 153,
  userPreferences: ["Knie schonen"],
  runDaysPerWeek: 4,
  availableDays: ["Mo", "Mi", "Fr", "So"],
  longRunDay: "So",
  currentWeeklyKm: 35,
  longestRecentRunKm: 12,
  longestRecentRunKmIsDefault: true,
  recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: "2026-09-27", estimated: false },
  ...extra,
});

describe("Hilfsfunktionen", () => {
  it("germanDateToYmd: TT.MM.JJJJ mit und ohne führende Null, nur echte Daten", () => {
    expect(germanDateToYmd("9.11.2026")).toBe("2026-11-09");
    expect(germanDateToYmd(" 09.11.2026 ")).toBe("2026-11-09");
    expect(germanDateToYmd("29.02.2028")).toBe("2028-02-29");
    expect(germanDateToYmd("29.02.2027")).toBeNull();
    expect(germanDateToYmd("31.04.2027")).toBeNull();
    expect(germanDateToYmd("2027-04-18")).toBeNull();
    expect(germanDateToYmd(null)).toBeNull();
  });

  it("coreDistanceOfKm: nur die vier Distanzen, Marathon auch als 42,195", () => {
    expect([5, 10, 21.1, 21.0975, 42.2, 42.195].map(coreDistanceOfKm)).toEqual(["5k", "10k", "hm", "hm", "m", "m"]);
    expect([15, 50, 0, NaN, "42.2"].map(coreDistanceOfKm)).toEqual([null, null, null, null, null]);
  });

  it("goalSecondsOf: h:mm:ss und h:mm, sonst null", () => {
    expect(goalSecondsOf("3:59:00")).toBe(14340);
    expect(goalSecondsOf("0:45:30")).toBe(2730);
    expect(goalSecondsOf("1:45")).toBe(6300);
    expect(goalSecondsOf("0:00:00")).toBeNull();
    expect(goalSecondsOf("3:75:00")).toBeNull();
    expect(goalSecondsOf("schnell")).toBeNull();
    expect(goalSecondsOf(null)).toBeNull();
  });

  it("berlinTodayYmd: Kalendertag in Europe/Berlin, nicht UTC", () => {
    expect(berlinTodayYmd(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
    expect(berlinTodayYmd(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(berlinTodayYmd(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });
});

describe("profileToCoreInputs", () => {
  it("vollständiges Profil → CoreInputs; Wünsche (Freitext) werden nicht übernommen", () => {
    const result = profileToCoreInputs(profile(), TODAY);
    expect(result).toEqual({
      ok: true,
      notes: [],
      inputs: {
        distance: "m",
        raceDate: "2027-04-18",
        startYmd: "2026-11-16",
        runDaysPerWeek: 4,
        availableDays: ["Mo", "Mi", "Fr", "So"],
        longRunDay: "So",
        currentWeeklyKm: 35,
        longestRecentRunKm: 12,
        recentRace: { distanceKm: 21.1, timeSeconds: 6900, dateYmd: "2026-09-27", estimated: false },
        goalTime: 14340,
      },
    });
    expect(JSON.stringify(result)).not.toContain("Knie");
  });

  it("alter Client ohne Plan-Eingaben → inputs-missing mit Feldnamen", () => {
    const old = profile();
    ["runDaysPerWeek", "availableDays", "longRunDay", "currentWeeklyKm", "longestRecentRunKm", "longestRecentRunKmIsDefault", "recentRace"].forEach(
      (key) => delete old[key],
    );
    expect(profileToCoreInputs(old, TODAY)).toEqual({
      ok: false,
      reason: "inputs-missing",
      fields: ["runDaysPerWeek", "availableDays", "currentWeeklyKm"],
    });
  });

  it("zu wenige verfügbare Tage → inputs-missing; Long-Run-Tag außerhalb fällt weg (Kern-Vorgabe)", () => {
    expect(profileToCoreInputs(profile({ availableDays: ["Mo", "So"] }), TODAY)).toMatchObject({ ok: false, fields: ["availableDays"] });
    const result = profileToCoreInputs(profile({ longRunDay: "Sa" }), TODAY);
    expect(result.ok).toBe(true);
    expect(result.ok && "longRunDay" in result.inputs).toBe(false);
  });

  it("andere Distanz → distance-unsupported; ungültige Daten → dates-invalid", () => {
    expect(profileToCoreInputs(profile({ raceDistanceKm: 15 }), TODAY)).toEqual({
      ok: false,
      reason: "distance-unsupported",
      fields: ["raceDistanceKm"],
    });
    expect(profileToCoreInputs(profile({ raceDate: "31.02.2027", planStartDate: "x" }), TODAY)).toEqual({
      ok: false,
      reason: "dates-invalid",
      fields: ["raceDate", "planStartDate"],
    });
  });

  it("fehlender Trainingsstart → heute", () => {
    const result = profileToCoreInputs(profile({ planStartDate: "" }), TODAY);
    expect(result.ok && result.inputs.startYmd).toBe(TODAY);
  });

  it("Wettkampfdatum muss existieren und darf nicht in der Zukunft liegen, sonst ohne Rennergebnis (Hinweis)", () => {
    const race = profile().recentRace as Record<string, unknown>;
    const future = profileToCoreInputs(profile({ recentRace: { ...race, dateYmd: "2026-11-11" } }), TODAY);
    expect(future).toMatchObject({ ok: true, notes: ["recent-race-date-in-future"] });
    expect(future.ok && future.inputs.recentRace).toBeUndefined();

    const sameDay = profileToCoreInputs(profile({ recentRace: { ...race, dateYmd: TODAY } }), TODAY);
    expect(sameDay.ok && sameDay.inputs.recentRace?.dateYmd).toBe(TODAY);

    const impossible = profileToCoreInputs(profile({ recentRace: { ...race, dateYmd: "2026-02-30" } }), TODAY);
    expect(impossible).toMatchObject({ ok: true, notes: ["recent-race-date-invalid"] });
    expect(impossible.ok && impossible.inputs.recentRace).toBeUndefined();

    const estimate = profileToCoreInputs(profile({ recentRace: { distanceKm: 10, timeSeconds: 2900, dateYmd: null, estimated: true } }), TODAY);
    expect(estimate.ok && estimate.inputs.recentRace).toEqual({ distanceKm: 10, timeSeconds: 2900, dateYmd: null, estimated: true });

    const none = profileToCoreInputs(profile({ recentRace: null }), TODAY);
    expect(none.ok && "recentRace" in none.inputs).toBe(false);
  });

  it("Ziel „Finishen“ → kein goalTime; unlesbare Zielzeit → Hinweis", () => {
    const finish = profileToCoreInputs(profile({ raceGoal: "finish", raceTargetTime: null }), TODAY);
    expect(finish.ok && "goalTime" in finish.inputs).toBe(false);
    expect(profileToCoreInputs(profile({ raceTargetTime: "bald" }), TODAY)).toMatchObject({ ok: true, notes: ["goal-time-invalid"] });
  });

  it("Rundlauf: P1–P6 und 300 Zufallseingaben → Wizard-Profil → Server-Whitelist → Mapping ergibt dieselben Eingaben", () => {
    const cases = PROFILES.map((p) => ({ inputs: p.inputs, todayYmd: p.todayYmd }));
    for (let seed = 20261110; seed < 20261110 + 300; seed += 1) cases.push(randomInputs(seed));
    cases.forEach(({ inputs, todayYmd }) => {
      const cleaned = validatePlanBody({ profile: wizardProfileOf(inputs) }).payload.profile;
      const result = profileToCoreInputs(cleaned, todayYmd);
      const expected = { ...inputs, availableDays: inputs.availableDays.slice() };
      if (expected.recentRace === undefined) delete expected.recentRace;
      expect(result).toEqual({ ok: true, notes: [], inputs: expected });
    });
  });
});

describe("planMetrics", () => {
  const w = (ymd: string, sessionType: string, km: number) => ({
    dateIso: `${ymd}T12:00:00.000Z`,
    sport: sessionType === "rest" ? "rest" : "run",
    sessionType,
    km,
  });

  it("rechnet Peak ohne Rennen, Long Runs, Q vor der Rennwoche, Läufe je Woche und Taper-Anteile", () => {
    const plan = {
      workouts: [
        w("2027-03-01", "easy", 8),
        w("2027-03-02", "interval", 10),
        w("2027-03-04", "tempo", 12),
        w("2027-03-07", "long", 30),
        w("2027-03-03", "rest", 0),
        w("2027-03-08", "easy", 6),
        w("2027-03-10", "tempo", 8),
        w("2027-03-13", "long", 20),
        w("2027-03-15", "easy", 5),
        w("2027-03-21", "race", 42.2),
      ],
    };
    expect(planMetrics(plan)).toEqual({
      weeks: 3,
      totalKm: 141.2,
      peakWeekKm: 60,
      longestRunKm: 30,
      longRunsAtLeast30: 1,
      qPerWeek: 1.5,
      maxRunDaysPerWeek: 4,
      preRaceWeekPct: 57,
      raceWeekPct: 8,
    });
  });

  it("leerer Plan ohne Fehler", () => {
    expect(planMetrics({})).toMatchObject({ weeks: 0, peakWeekKm: 0, preRaceWeekPct: null, raceWeekPct: null });
  });
});
