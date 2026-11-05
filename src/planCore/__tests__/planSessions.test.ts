import { randomInputs } from "../__fixtures__/randomInputs";
import { checkSessionPlan } from "../__fixtures__/sessionChecks";
import { easyMinKm } from "../sessions";
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

  /** Erste Einheit mit Hinweis `note` in den Zufallsplänen (Seed ab 20261107), dazu der Long Run, auf den sie sich bezieht. */
  function firstWith(note: string): { plan: SessionPlan; km: number; refLr: number } {
    for (let index = 0; index < 500; index += 1) {
      const { inputs, todayYmd } = randomInputs(20261107 + index);
      const plan = planSessions(inputs, todayYmd);
      let last: number | null = null;
      for (let w = 0; w < plan.weeks.length; w += 1) {
        const week = plan.weeks[w];
        const lr = week.sessions.filter((s) => s.kind === "LR" || s.kind === "LR+M")[0];
        const ref = lr !== undefined ? lr.km : last;
        const hit = week.sessions.filter((s) => s.notes.indexOf(note as never) >= 0)[0];
        if (hit !== undefined && ref !== null) return { plan, km: hit.km, refLr: ref };
        if (lr !== undefined) last = lr.km;
      }
    }
    throw new Error(`kein Fall mit ${note}`);
  }

  it("E über 75 % des Long Runs nur bis zur E-Mindestdauer und nie länger als der Long Run (e-above-75-percent-long-run)", () => {
    const { plan, km, refLr } = firstWith("e-above-75-percent-long-run");
    expect(km).toBeGreaterThan(0.75 * refLr);
    expect(km).toBeLessThanOrEqual(refLr);
    expect(km).toBeLessThanOrEqual(Math.max(Math.floor(7.5 * refLr) / 10, easyMinKm("E", plan.paces)));
  });

  it("Long Run kürzer als die E-Mindestdauer: E/REC genau auf seine Länge gekürzt (e-shortened-to-long-run)", () => {
    const { plan, km, refLr } = firstWith("e-shortened-to-long-run");
    expect(refLr).toBeLessThan(easyMinKm("E", plan.paces));
    expect(km).toBe(Math.floor(refLr * 10 + 1e-9) / 10);
  });

  it("ist deterministisch (I20-Anteil)", () => {
    PROFILES.forEach((profile) => expect(planOf(profile.name)).toEqual(planOf(profile.name)));
  });
});
