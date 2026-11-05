import { randomInputs } from "../__fixtures__/randomInputs";
import { checkSessionPlan, checkVolumeGrowth } from "../__fixtures__/sessionChecks";
import { easyHardMinKm, easyMinKm } from "../sessions";
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

  it("harte Untergrenze 15 min: liegt die Long-Run-Grenze darunter, ist der Long Run genau 15 min (long-run-raised-to-minimum)", () => {
    const { plan, refLr } = firstWith("long-run-raised-to-minimum");
    expect(refLr).toBe(easyHardMinKm("LR", plan.paces));
    plan.weeks.forEach((w) =>
      w.sessions
        .filter((s) => s.kind === "E" || s.kind === "REC" || s.kind === "LR")
        .forEach((s) => expect(s.km).toBeGreaterThanOrEqual(easyHardMinKm(s.kind as "E" | "REC" | "LR", plan.paces))),
    );
  });

  it("Entlastungswoche: Q1 mit dem Faktor der Woche (P5 W12: M-Block ≤ 10 km × 71/89; Review-Punkt 36)", () => {
    const plan = planOf("P5");
    const w12 = plan.weeks[11];
    expect(w12.isRecoveryWeek).toBe(true);
    const factor = plan.volume.weeks[11].fullWeekKm / plan.volume.weeks[10].fullWeekKm;
    const q1 = w12.sessions.filter((s) => s.slot === "Q1")[0];
    expect(q1.kind).toBe("M");
    expect(q1.qualityKm).toBe(Math.floor(10 * factor * 10) / 10);
    expect(q1.notes).toEqual(expect.arrayContaining(["m-block-near-long-run", "q1-scaled-recovery-week"]));
  });

  it("3 Lauftage HM/M: E bis 90 min (übernimmt die MLR-Rolle; Review-Punkt 33)", () => {
    const plan = planOf("P6");
    const minutes = plan.weeks.reduce((list, w) => list.concat(w.sessions.filter((s) => s.kind === "E").map((s) => s.minutes)), [] as number[]);
    expect(Math.max.apply(null, minutes)).toBeGreaterThan(75);
    expect(Math.max.apply(null, minutes)).toBeLessThanOrEqual(90);
  });

  it("monotoner Verlauf in allen Profilen: keine Aufbauwoche kleiner als die Vorwoche, Peak in der letzten Woche vor dem Taper", () => {
    PROFILES.forEach((profile) => {
      const plan = planOf(profile.name);
      expect([profile.name, checkVolumeGrowth(plan, profile.inputs)]).toEqual([profile.name, []]);
      const pre = plan.volume.weeks.filter((w) => w.wn <= plan.volume.peakWeek);
      expect([profile.name, pre[pre.length - 1].fullWeekKm]).toEqual([profile.name, plan.volume.peakKm]);
    });
  });

  it("statt eine Aufbauwoche anzuheben, wird E bis 15 min gekürzt: sichtbarer Verlauf monoton (5k, längster Lauf 0 km)", () => {
    // Vorher: Wochen ohne Q auf 3 × 25 min = 18,6 km angehoben, Wochen mit R-Einheit 16,8 km (nicht monoton).
    const { inputs, todayYmd } = randomInputs(20261716);
    const plan = planSessions(inputs, todayYmd);
    expect(checkVolumeGrowth(plan, inputs)).toEqual([]);
    const build = plan.weeks.filter((w) => w.wn <= plan.volume.peakWeek && w.sessions.length === 7);
    expect(build.filter((w) => w.notes.indexOf("week-km-raised") >= 0)).toEqual([]);
    const shortened = build.reduce((list, w) => list.concat(w.sessions.filter((s) => s.notes.indexOf("e-shortened-to-fit-week") >= 0)), [] as SessionPlan["weeks"][number]["sessions"]);
    expect(shortened.length).toBeGreaterThan(0);
    shortened.forEach((s) => {
      expect(s.km).toBeLessThan(easyMinKm(s.kind as "E" | "REC", plan.paces));
      expect(s.km).toBeGreaterThanOrEqual(easyHardMinKm(s.kind as "E" | "REC", plan.paces));
    });
  });

  it("ist deterministisch (I20-Anteil)", () => {
    PROFILES.forEach((profile) => expect(planOf(profile.name)).toEqual(planOf(profile.name)));
  });
});
