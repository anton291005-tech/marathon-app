import { checkSessionPlan } from "../__fixtures__/sessionChecks";
import { PROFILES } from "../__fixtures__/profiles";
import type { ProfileName } from "../__fixtures__/profiles";
import { planSessions } from "../planSessions";
import type { SessionPlan } from "../planSessions";

const planOf = (name: ProfileName): SessionPlan => {
  const profile = PROFILES.filter((p) => p.name === name)[0];
  return planSessions(profile.inputs, profile.todayYmd);
};

describe("planCore planSessions (Schritt 6)", () => {
  it("eine Einheit je Layout-Tag, gleiche Rolle; Wochensumme = Summe der Einheiten (I1)", () => {
    PROFILES.forEach((profile) => {
      const plan = planOf(profile.name);
      expect(plan.weeks).toHaveLength(plan.layouts.length);
      plan.weeks.forEach((week, index) => {
        const layout = plan.layouts[index];
        expect(week.sessions.map((s) => [s.ymd, s.slot])).toEqual(layout.days.map((d) => [d.ymd, d.slot]));
        const sum = Math.round(week.sessions.reduce((total, s) => total + s.km, 0) * 10) / 10;
        expect(week.totalKm).toBe(sum);
      });
    });
  });

  it("Woche ohne Hinweis trifft die Wochen-km aus planVolume genau", () => {
    PROFILES.forEach((profile) => {
      planOf(profile.name)
        .weeks.filter((week) => week.notes.length === 0)
        .forEach((week) => expect([profile.name, week.wn, week.totalKm]).toEqual([profile.name, week.wn, week.targetKm]));
    });
  });

  it("minWeekKm geht an planVolume: P1 beginnt mit 11 statt 10 km", () => {
    const plan = planOf("P1");
    expect(plan.minWeekKm).toBe(11);
    expect(plan.volume.weeks[0].targetKm).toBe(11);
  });

  it("planVolume plant nur Lieferbares: volle Nicht-Taper-Wochen treffen ihr Ziel, P6 ist durch die Tragfähigkeit begrenzt", () => {
    PROFILES.forEach((profile) => {
      const plan = planOf(profile.name);
      plan.weeks
        .filter((w) => w.sessions.length === 7 && w.phase !== "taper")
        .forEach((w) => expect([profile.name, w.wn, w.notes]).toEqual([profile.name, w.wn, []]));
    });
    const p6 = planOf("P6");
    const capped = p6.volume.weeks.filter((w) => w.curveKm > w.fullWeekKm);
    expect(capped.length).toBeGreaterThan(0);
    expect(p6.volume.notes.some((note) => note.code === "peak-not-reached")).toBe(false);
  });

  it("kein Long Run über Start-, Steigerungs-, Entlastungs-, Taper- oder Anteilsgrenze (Prüfer ohne Ausnahme)", () => {
    PROFILES.forEach((profile) => {
      const plan = planOf(profile.name);
      expect(checkSessionPlan(plan, profile.inputs).filter((code) => code.indexOf("I9") === 0)).toEqual([]);
    });
  });

  it("ist deterministisch (I20-Anteil)", () => {
    PROFILES.forEach((profile) => expect(planOf(profile.name)).toEqual(planOf(profile.name)));
  });
});
