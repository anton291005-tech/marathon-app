import { CONFIG } from "../config";
import { diffDays } from "../dates";
import { checkSessionPlan, compactSessions } from "../__fixtures__/sessionChecks";
import { PROFILES } from "../__fixtures__/profiles";
import type { Profile, ProfileName } from "../__fixtures__/profiles";
import { planSessions } from "../planSessions";
import type { SessionPlan } from "../planSessions";
import type { CoreSession } from "../sessions";

const byName = (name: ProfileName): Profile => PROFILES.filter((p) => p.name === name)[0];
const planOf = (profile: Profile): SessionPlan => planSessions(profile.inputs, profile.todayYmd);
const all = (plan: SessionPlan): CoreSession[] => plan.weeks.reduce((list, w) => list.concat(w.sessions), [] as CoreSession[]);
const longRuns = (plan: SessionPlan): number[] => all(plan).filter((s) => s.kind === "LR" || s.kind === "LR+M").map((s) => s.km);
const quality = (s: CoreSession): number =>
  Math.round(
    s.segments.reduce((sum, x) => sum + (x.type === "reps" ? x.reps * x.repKm : x.type === "steady" ? x.km : 0), 0) * 10,
  ) / 10;
/** Höchster tatsächlicher Wochenumfang bis zur Peak-Woche (ohne Taper). */
const peakActual = (plan: SessionPlan): number => Math.max.apply(null, plan.weeks.filter((w) => w.phase !== "taper").map((w) => w.totalKm));

/**
 * Abnahmebereiche aus docs/plan-spec.md §13: P4/P6 Long-Run-Peak nach der Freigabe zu Schritt 6; P2 (10–13 → 10–15) und
 * P3 (18–21 → 18–22) als Folge der Long-Run-Ziel-Regel vom 2026-11-05 (Anteilsgrenze × Peak-Woche), bestätigt 2026-11-05.
 */
const ACCEPTANCE: Record<ProfileName, { peak: [number, number]; longRun: [number, number] }> = {
  P1: { peak: [13, 15], longRun: [7, 8] },
  P2: { peak: [28, 35], longRun: [10, 15] },
  P3: { peak: [55, 65], longRun: [18, 22] },
  P4: { peak: [50, 55], longRun: [24, 25] },
  P5: { peak: [95, 105], longRun: [30, 34] },
  P6: { peak: [40, 45], longRun: [23, 24] },
};

describe("Referenzprofile P1–P6: Einheiten (§13)", () => {
  PROFILES.forEach((profile) => {
    it(`${profile.name} ${profile.label}: keine Verstöße, Peak und Long-Run-Peak in den Abnahmebereichen`, () => {
      const plan = planOf(profile);
      expect(checkSessionPlan(plan, profile.inputs)).toEqual([]);
      const { peak, longRun } = ACCEPTANCE[profile.name];
      const lrPeak = Math.max.apply(null, longRuns(plan));
      expect([plan.volume.peakKm >= peak[0], plan.volume.peakKm <= peak[1]]).toEqual([true, true]);
      expect([peakActual(plan) >= peak[0], peakActual(plan) <= peak[1]]).toEqual([true, true]);
      expect([lrPeak, lrPeak >= longRun[0] && lrPeak <= longRun[1]]).toEqual([lrPeak, true]);
    });
  });

  it("P1 (Einsteiger): keine I/R, T nach Minuten ohne Pace, Rennwoche ohne Q (Folgepunkt a)", () => {
    const plan = planOf(byName("P1"));
    const sessions = all(plan);
    expect(sessions.filter((s) => s.kind === "I" || s.kind === "R")).toEqual([]);
    sessions
      .filter((s) => s.kind === "T")
      .forEach((s) => {
        expect(s.paceBand).toBeNull();
        expect(s.segments[1]).toMatchObject({ type: "steady", pace: "T" });
      });
    const race = plan.weeks[plan.weeks.length - 1];
    expect(race.sessions.filter((s) => ["T", "I", "R", "M"].indexOf(s.kind) >= 0)).toEqual([]);
    expect(race.sessions.some((s) => s.notes.indexOf("q-softened-beginner-race-week") >= 0)).toBe(true);
  });

  it("P2 (10k): in der Basis höchstens 1 Qualitätseinheit pro Woche", () => {
    planOf(byName("P2"))
      .weeks.filter((w) => w.phase === "base")
      .forEach((w) => expect(w.sessions.filter((s) => ["T", "I", "R", "M"].indexOf(s.kind) >= 0).length).toBeLessThanOrEqual(1));
  });

  it("P3 (HM): T-Einheit ≤ 6,5 km; Spezifisch Q1 HM-Pace-Blöcke, Q2 wechselt I / T", () => {
    const plan = planOf(byName("P3"));
    all(plan)
      .filter((s) => s.kind === "T")
      .forEach((s) => expect(quality(s)).toBeLessThanOrEqual(6.5));
    const specific = plan.weeks.filter((w) => w.phase === "peak" && !w.isRecoveryWeek);
    expect(specific.map((w) => w.sessions.filter((s) => s.slot === "Q2")[0].kind)).toEqual(["I", "T"]);
    specific.forEach((w) => expect(w.sessions.filter((s) => s.slot === "Q1")[0]).toMatchObject({ kind: "T", racePace: true }));
  });

  it("P4 (M, 4 Tage): mindestens 2 Long Runs ≥ 24 km", () => {
    expect(longRuns(planOf(byName("P4"))).filter((km) => km >= 24).length).toBeGreaterThanOrEqual(2);
  });

  it("P5 (M, 6 Tage): 2–3 Long Runs ≥ 30 km, T ≤ 10 km, keine Woche über 110 km", () => {
    const plan = planOf(byName("P5"));
    const long30 = longRuns(plan).filter((km) => km >= 30).length;
    expect(long30 >= 2 && long30 <= 3).toBe(true);
    all(plan)
      .filter((s) => s.kind === "T")
      .forEach((s) => expect(quality(s)).toBeLessThanOrEqual(10));
    plan.weeks.forEach((w) => expect(w.totalKm).toBeLessThanOrEqual(110));
  });

  it("Marathon: M-Block ≤ 10 km, wenn der Long Run höchstens 2 Tage später kommt; bei 3 Tagen Abstand länger möglich", () => {
    const near = CONFIG.library.m.nearLongRunDays.value;
    const maxNear = CONFIG.library.m.nearLongRunMaxKm.value;
    const check = (plan: SessionPlan): { nearMax: number; farMax: number } => {
      const sessions = all(plan);
      const lrDates = sessions.filter((s) => s.kind === "LR" || s.kind === "LR+M").map((s) => s.ymd);
      let nearMax = 0;
      let farMax = 0;
      sessions
        .filter((s) => s.kind === "M")
        .forEach((s) => {
          const gap = lrDates.map((d) => diffDays(d, s.ymd)).filter((d) => d >= 1).sort((a, b) => a - b)[0];
          if (gap !== undefined && gap <= near) nearMax = Math.max(nearMax, quality(s));
          else farMax = Math.max(farMax, quality(s));
        });
      return { nearMax, farMax };
    };
    // P5: Q1 am Freitag (Long Run − 2): alle M-Blöcke ≤ 10 km, mindestens einer genau an der Grenze.
    const p5 = check(planOf(byName("P5")));
    expect(p5.nearMax).toBe(maxNear);
    // P5 mit 5 Tagen: Q1 am Donnerstag (Long Run − 3), der M-Lauf darf länger sein.
    const five = byName("P5");
    const p5five = check(planSessions({ ...five.inputs, runDaysPerWeek: 5 }, five.todayYmd));
    expect(p5five.nearMax).toBeLessThanOrEqual(maxNear);
    expect(p5five.farMax).toBeGreaterThan(maxNear);
  });

  it("Taper-Long-Run 7 Tage vor HM/M höchstens 60 % des längsten (Folgepunkt b)", () => {
    (["P3", "P4", "P5", "P6"] as ProfileName[]).forEach((name) => {
      const plan = planOf(byName(name));
      const taper = plan.weeks.filter((w) => w.mode === "taper")[0];
      const lr = taper.sessions.filter((s) => s.kind === "LR")[0];
      expect(diffDays(byName(name).inputs.raceDate, lr.ymd)).toBe(7);
      expect(lr.km).toBeLessThanOrEqual(0.6 * Math.max.apply(null, longRuns(plan)) + 1e-9);
      expect(lr.notes).toContain("taper-long-run-cut");
    });
  });

  it("Snapshot aller Wochen (Änderungen sind bewusst)", () => {
    const out: Record<string, string[]> = {};
    PROFILES.forEach((profile) => {
      const plan = planOf(profile);
      out[profile.name] = plan.weeks.map(
        (w) => `W${w.wn} ${w.phase}${w.isRecoveryWeek ? "/R" : ""} ${w.totalKm}/${w.targetKm}${w.notes.length ? ` ${w.notes.join(",")}` : ""}: ${compactSessions(plan, w.wn)}`,
      );
    });
    expect(out).toMatchSnapshot();
  });
});
