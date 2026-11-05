import { CONFIG } from "../config";
import { PROFILES } from "../__fixtures__/profiles";
import type { ProfileName } from "../__fixtures__/profiles";
import { buildPaceProfile, paceBands } from "../pace";
import {
  buildEasySession,
  buildLongRunPlusM,
  buildQualityParts,
  easyHardMinKm,
  easyMaxKmByMinutes,
  easyMaxMinutes,
  easyMinKm,
  minQualityKm,
  qualityLimitKm,
  segmentsKm,
  sessionPacesOf,
  stridesSegment,
  warmupCooldownFor,
} from "../sessions";
import type { SessionPaces } from "../sessions";

function pacesOf(name: ProfileName): SessionPaces {
  const profile = PROFILES.filter((p) => p.name === name)[0];
  return sessionPacesOf(buildPaceProfile(profile.inputs, profile.todayYmd), profile.inputs.distance);
}

describe("planCore sessions (§7)", () => {
  const p1 = pacesOf("P1");
  const p3 = pacesOf("P3");
  const p5 = pacesOf("P5");

  describe("Pace-Bänder (Review-Punkt 27)", () => {
    it("P3: E aus 0,70/0,62 VO2max um die E-Pace, REC = E + 20…40 s, M/T/I/R/Renntempo ± 5 s", () => {
      expect(p3.E).toBe(338);
      const bands = p3.bands;
      expect(bands.E!.fast).toBeLessThan(p3.E);
      expect(bands.E!.slow).toBeGreaterThan(p3.E);
      expect(bands.REC).toEqual({ fast: p3.E + 20, slow: p3.E + 40 });
      expect(bands.T).toEqual({ fast: p3.T! - 5, slow: p3.T! + 5 });
      expect(bands.RACE).toEqual({ fast: 265, slow: 275 });
    });

    it("I17: Mittelpunkte der Bänder sind geordnet (REC > E > M > T > I > R)", () => {
      [p3, p5].forEach((paces) => {
        const mid = (code: "REC" | "E" | "M" | "T" | "I" | "R") => (paces.bands[code]!.fast + paces.bands[code]!.slow) / 2;
        expect(mid("REC")).toBeGreaterThan(mid("E"));
        expect(mid("E")).toBeGreaterThan(mid("M"));
        expect(mid("M")).toBeGreaterThan(mid("T"));
        expect(mid("T")).toBeGreaterThan(mid("I"));
        expect(mid("I")).toBeGreaterThan(mid("R"));
      });
    });

    it("Einsteiger: nur E (7:00–7:30) und REC", () => {
      expect(p1.beginner).toBe(true);
      expect(paceBands(buildPaceProfile(PROFILES[0].inputs, PROFILES[0].todayYmd))).toEqual({
        E: { fast: 420, slow: 450 },
        REC: { fast: 440, slow: 460 },
      });
    });
  });

  describe("lockere Einheiten", () => {
    it("Mindest- und Höchst-km aus den Minuten (E 25–75/90, REC 20–45, MLR 75–110)", () => {
      expect(easyMinKm("E", p1)).toBe(3.6);
      expect(easyMinKm("REC", p5)).toBe(3.8);
      expect(easyMinKm("MLR", p5)).toBe(15.7);
      expect(easyMaxKmByMinutes("E", p3, 5, "hm")).toBe(13.3);
      expect(easyMaxKmByMinutes("E", p5, 6, "m")).toBe(18.8);
      expect(easyMaxKmByMinutes("MLR", p5, 6, "m")).toBe(22.9);
    });

    it("E bei 3 Lauftagen: HM/M bis 90 min (E übernimmt die MLR-Rolle, Review-Punkt 33), 5k/10k bis 75 min", () => {
      expect(easyMaxMinutes(3, "m")).toBe(90);
      expect(easyMaxMinutes(3, "hm")).toBe(90);
      expect(easyMaxMinutes(3, "10k")).toBe(75);
      expect(easyMaxMinutes(4, "m")).toBe(75);
      expect(easyMaxMinutes(6, "5k")).toBe(90);
      expect(easyMaxKmByMinutes("E", p3, 3, "hm")).toBe(15.9);
      expect(easyMaxKmByMinutes("E", p3, 3, "10k")).toBe(13.3);
    });

    it("harte Untergrenze 15 min (Review-Punkt 34): E/LR bei E-Pace, REC bei REC-Pace", () => {
      expect(easyHardMinKm("E", p1)).toBe(2.2);
      expect(easyHardMinKm("LR", p3)).toBe(2.7);
      expect(easyHardMinKm("REC", p3)).toBe(2.5);
    });

    it("Strides zählen nicht zu den km", () => {
      const session = buildEasySession({ ymd: "2027-01-01", slot: "E", kind: "E", km: 9.4, paces: p3, strides: stridesSegment(false) });
      expect(session.km).toBe(9.4);
      expect(segmentsKm(session.segments)).toBe(9.4);
      expect(session.segments[1]).toEqual({ type: "strides", reps: 6, meters: 100, seconds: 20 });
      expect(session.paceBand!.code).toBe("E");
    });
  });

  describe("Qualität: Limits (I12)", () => {
    it("T ≤ 10 %, I ≤ min(8 %, 10 km), R ≤ min(5 %, 8 km), M ≤ min(29 km, 110 min), Q1L halb", () => {
      expect(qualityLimitKm({ type: "T" }, 61, p3)).toBe(6.1);
      expect(qualityLimitKm({ type: "RACE_PACE", kind: "T" }, 61, p3)).toBe(6.1);
      expect(qualityLimitKm({ type: "I" }, 96, p5)).toBe(7.6);
      expect(qualityLimitKm({ type: "I" }, 150, p5)).toBe(10);
      expect(qualityLimitKm({ type: "R" }, 30, p3)).toBe(1.5);
      expect(qualityLimitKm({ type: "M" }, 96, p5)).toBe(27.2);
      expect(qualityLimitKm({ type: "T" }, 53, p3, { light: true })).toBe(2.6);
    });

    it("M höchstens 10 km, wenn der Long Run höchstens 2 Tage später kommt (Review-Punkt 24)", () => {
      expect(qualityLimitKm({ type: "M" }, 96, p5, { nearLongRun: true })).toBe(CONFIG.library.m.nearLongRunMaxKm.value);
    });
  });

  it("Ein-/Auslaufen nach Wochen-km (Review-Punkt 23)", () => {
    expect(warmupCooldownFor(26)).toEqual({ warmupKm: 1.5, cooldownKm: 1.5 });
    expect(warmupCooldownFor(61)).toEqual({ warmupKm: 2, cooldownKm: 1.5 });
    expect(warmupCooldownFor(96)).toEqual({ warmupKm: 2.5, cooldownKm: 2 });
  });

  describe("Qualität: Bausteine", () => {
    it("T bis 20 min als Dauerlauf, darüber Cruise 3–5 × 1,6 km mit 60 s Trab", () => {
      const short = buildQualityParts({ type: "T" }, 4.4, 53, p3)!;
      expect(short.segments[1]).toEqual({ type: "steady", km: 4.4, pace: "T" });
      const cruise = buildQualityParts({ type: "T" }, 5.3, 53, p3)!;
      expect(cruise.segments).toEqual([
        { type: "warmup", km: 2 },
        { type: "reps", reps: 3, repKm: 1.6, pace: "T", restSec: 60, restKm: 0.4 },
        { type: "cooldown", km: 1.5 },
      ]);
      expect(segmentsKm(cruise.segments)).toBe(8.7);
      expect(cruise.qualityKm).toBe(4.8);
      expect(buildQualityParts({ type: "T" }, 9.6, 96, p5)!.segments[1]).toMatchObject({ reps: 5, repKm: 1.6 });
    });

    it("I: Wiederholungen ≈ 4 min, Trabpause gleich lang (30-s-Schritte), mindestens 3", () => {
      const parts = buildQualityParts({ type: "I" }, 4.9, 61, p3)!;
      expect(parts.segments[1]).toEqual({ type: "reps", reps: 4, repKm: 1, pace: "I", restSec: 240, restKm: 2.4 });
      expect(buildQualityParts({ type: "I" }, 1.5, 20, p3)).toBeNull();
    });

    it("R: 400 m ab 6 Wiederholungen, sonst 200 m, mindestens 4, Pause = 2 × Dauer", () => {
      const r400 = buildQualityParts({ type: "R" }, 2.4, 48, p3)!;
      expect(r400.segments[1]).toMatchObject({ reps: 6, repKm: 0.4 });
      const r200 = buildQualityParts({ type: "R" }, 1.5, 30, p3)!;
      expect(r200.segments[1]).toMatchObject({ reps: 7, repKm: 0.2, restSec: 90 });
      expect(buildQualityParts({ type: "R" }, 0.7, 14, p3)).toBeNull();
    });

    it("Renntempo-Blöcke: HM 2 km mit 120 s, bei wenig Platz 2 kürzere Wiederholungen", () => {
      const hm = buildQualityParts({ type: "RACE_PACE", kind: "T" }, 6.1, 61, p3)!;
      expect(hm.kind).toBe("T");
      expect(hm.racePace).toBe(true);
      expect(hm.segments[1]).toEqual({ type: "reps", reps: 3, repKm: 2, pace: "RACE", restSec: 120, restKm: 0.8 });
      expect(buildQualityParts({ type: "RACE_PACE", kind: "T" }, 2.6, 26, p3)!.segments[1]).toMatchObject({ reps: 2, repKm: 1.3 });
      expect(minQualityKm({ type: "M" }, p5)).toBe(3);
      expect(minQualityKm({ type: "T" }, p3)).toBe(2.3);
    });

    it("Mindestgrößen (freigegeben 2026-11-05): M ≥ 3 km, T ≥ 10 min, I ≥ 3 Wdh., R ≥ 4 Wdh., darunter null (E + Strides)", () => {
      // T 4:28/km: 2,2 km = 9,8 min → null, 2,3 km = 10,3 min → Block
      expect(buildQualityParts({ type: "T" }, 2.2, 30, p3)).toBeNull();
      expect(buildQualityParts({ type: "T" }, 2.3, 30, p3)!.segments[1]).toEqual({ type: "steady", km: 2.3, pace: "T" });
      expect(buildQualityParts({ type: "M" }, 2.9, 60, p5)).toBeNull();
      expect(buildQualityParts({ type: "M" }, 3, 60, p5)!.segments[1]).toEqual({ type: "steady", km: 3, pace: "M" });
      expect(buildQualityParts({ type: "RACE_PACE", kind: "T" }, 2, 30, p3)).toBeNull();
      expect(buildQualityParts({ type: "RACE_PACE", kind: "I" }, 1.7, 40, p3)).toBeNull();
      expect(buildQualityParts({ type: "RACE_PACE", kind: "I" }, 1.8, 40, p3)!.segments[1]).toMatchObject({ reps: 3, repKm: 0.6 });
      // Einsteiger: T nach Minuten mindestens 10 min
      expect(buildQualityParts({ type: "T" }, 1.1, 15, p1)).toBeNull();
      expect(buildLongRunPlusM({ ymd: "2027-02-21", slot: "LR", longRunKm: 30, blockKm: 2.9, paces: p5 })).toBeNull();
    });

    it("Einsteiger: T/M nach Minuten, km über die E-Pace, kein Pace-Ziel", () => {
      const t = buildQualityParts({ type: "T" }, 1.5, 15, p1)!;
      expect(t.segments[1]).toEqual({ type: "steady", km: 1.4, pace: "T", minutes: 10 });
      expect(buildQualityParts({ type: "T" }, 5, 50, p1)!.segments[1]).toMatchObject({ minutes: 20 });
      expect(buildQualityParts({ type: "M" }, 12, 60, p1)!.segments[1]).toEqual({ type: "steady", km: 12, pace: "M", minutes: 84 });
      expect(p1.bands.T).toBeUndefined();
    });
  });

  describe("LR+M", () => {
    it("M-Block am Ende, höchstens 50 % des Long Runs", () => {
      const session = buildLongRunPlusM({ ymd: "2027-02-21", slot: "LR", longRunKm: 30, blockKm: 20, paces: p5 })!;
      expect(session.kind).toBe("LR+M");
      expect(session.segments).toEqual([
        { type: "easy", km: 15 },
        { type: "steady", km: 15, pace: "M" },
      ]);
      expect(session.km).toBe(30);
      expect(session.qualityKm).toBe(15);
    });
  });
});
