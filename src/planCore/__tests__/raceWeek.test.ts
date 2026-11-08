import { PROFILES } from "../__fixtures__/profiles";
import { buildPaceProfile } from "../pace";
import { buildRaceSession, isLastDaysBeforeRace, lastDaysMaxKm, stridesBeforeRace } from "../raceWeek";
import { sessionPacesOf } from "../sessions";

describe("planCore raceWeek (§8)", () => {
  const p3 = PROFILES.filter((p) => p.name === "P3")[0];
  const paces = sessionPacesOf(buildPaceProfile(p3.inputs, p3.todayYmd), "hm");
  const race = p3.inputs.raceDate; // Sonntag

  it("Rennen: Renndistanz, Renn-/Zielpace ± 5 s, keine Qualitäts-km", () => {
    const session = buildRaceSession(race, "hm", paces);
    expect(session).toMatchObject({ kind: "RACE", slot: "RACE", km: 21.1, qualityKm: 0, paceBand: { code: "RACE", fast: 265, slow: 275 } });
  });

  it("Einsteiger: Rennen ohne Pace-Ziel", () => {
    const p1 = PROFILES.filter((p) => p.name === "P1")[0];
    const beginner = sessionPacesOf(buildPaceProfile(p1.inputs, p1.todayYmd), "5k");
    expect(buildRaceSession(p1.inputs.raceDate, "5k", beginner)).toMatchObject({ km: 5, paceBand: null });
  });

  it("letzte 2 Tage vor dem Rennen: höchstens 30 min bei E-Pace, Strides am Vortag", () => {
    expect(isLastDaysBeforeRace("2027-03-13", race)).toBe(true);
    expect(isLastDaysBeforeRace("2027-03-12", race)).toBe(true);
    expect(isLastDaysBeforeRace("2027-03-11", race)).toBe(false);
    expect(isLastDaysBeforeRace(race, race)).toBe(false);
    // 30 min bei 5:38/km = 5,3 km
    expect(lastDaysMaxKm("2027-03-12", race, paces.E)).toBe(5.3);
    // REC: 30 min bei REC-Pace (6:08/km) = 4,8 km
    expect(lastDaysMaxKm("2027-03-12", race, paces.REC)).toBe(4.8);
    expect(lastDaysMaxKm("2027-03-10", race, paces.E)).toBe(Number.POSITIVE_INFINITY);
    expect(stridesBeforeRace("2027-03-13", race)).toBe(true);
    expect(stridesBeforeRace("2027-03-12", race)).toBe(false);
  });
});
