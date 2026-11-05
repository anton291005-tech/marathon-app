import { CONFIG } from "../config";
import {
  advanceLongRun,
  INITIAL_LONG_RUN_STATE,
  longestRecentRunKm,
  longRunLimitKm,
  longRunMinutesCapKm,
  longRunPeakTargetKm,
  longRunSchedule,
  longRunShareCapKm,
  longRunStartCapKm,
  longRunStepKm,
  peakLongRunRange,
} from "../longRun";
import type { LongRunState, LongRunWeek } from "../longRun";

const plainWeek: LongRunWeek = { hasLongRun: true, isRecoveryWeek: false, taper: false };

describe("planCore longRun (§7.1)", () => {
  describe("Grenzen", () => {
    it("Peak-Ziele nach Distanz, Marathon nach Lauftagen", () => {
      expect(peakLongRunRange("hm", 5)).toEqual({ min: 16, max: 22 });
      expect(peakLongRunRange("m", 4)).toEqual({ min: 26, max: 30 });
      expect(peakLongRunRange("m", 5)).toEqual({ min: 30, max: 34 });
    });

    it("längster Lauf: Angabe, sonst 30 % der Wochen-km, mindestens 5 km; Start höchstens +2 km", () => {
      expect(longestRecentRunKm({ currentWeeklyKm: 45, longestRecentRunKm: 16 })).toBe(16);
      expect(longestRecentRunKm({ currentWeeklyKm: 45 })).toBeCloseTo(13.5);
      expect(longestRecentRunKm({ currentWeeklyKm: 10 })).toBe(5);
      expect(longRunStartCapKm({ currentWeeklyKm: 45 })).toBe(15.5);
    });

    it("Anteil nach Lauftagen und 180 min bei E-Pace", () => {
      expect(longRunShareCapKm(5, 61)).toBe(23.1);
      expect(longRunShareCapKm(6, 96)).toBe(31.6);
      // 180 min bei 6:37/km (P4) = 27,2 km
      expect(longRunMinutesCapKm(397)).toBe(27.2);
    });

    it("Steigerung: +2 km oder +15 %, höchstens +3 km", () => {
      expect(longRunStepKm(10)).toBe(2);
      expect(longRunStepKm(16)).toBeCloseTo(2.4);
      expect(longRunStepKm(30)).toBe(3);
    });
  });

  describe("Ziel des längsten Long Runs = Anteilsgrenze × Peak-Woche, auf das Peak-Ziel begrenzt (freigegeben 2026-11-05)", () => {
    it.each([
      // Distanz, Lauftage, Peak-Woche, E-Pace, Ziel
      ["P1 5k: 55 % × 15 = 8,2 (im Bereich 8–14)", "5k", 3, 15, 420, 8.2],
      ["P2 10k: 50 % × 30 = 15 (im Bereich 12–18)", "10k", 4, 30, 468, 15],
      ["P3 HM: 38 % × 61 = 23,1 → Peak-Ziel höchstens 22", "hm", 5, 61, 338, 22],
      ["P4 M 4 Tage: 50 % × 50 = 25 (unter dem Peak-Ziel 26–30)", "m", 4, 50, 397, 25],
      ["P5 M 6 Tage: 33 % × 96 = 31,6", "m", 6, 96, 287, 31.6],
      ["P6 M 3 Tage: 55 % × 43 = 23,6 (unter dem Peak-Ziel 26–30)", "m", 3, 43, 429, 23.6],
    ] as const)("%s", (_label, distance, runDays, peakWeek, ePace, expected) => {
      expect(longRunPeakTargetKm(distance, runDays, peakWeek, ePace)).toBe(expected);
    });
  });

  describe("Verlauf", () => {
    it("linear vom Start zum Ziel, Entlastung/Taper/ohne LR sind null", () => {
      const weeks: LongRunWeek[] = [
        plainWeek,
        plainWeek,
        { hasLongRun: true, isRecoveryWeek: true, taper: false },
        plainWeek,
        plainWeek,
        { hasLongRun: true, isRecoveryWeek: false, taper: true },
        { hasLongRun: false, isRecoveryWeek: false, taper: true },
      ];
      expect(longRunSchedule(weeks, { startKm: 12, peakKm: 18, distance: "hm", runDays: 5 })).toEqual([
        12, 14, null, 16, 18, null, null,
      ]);
    });

    it("Marathon hält das Ziel in den letzten zwei normalen Wochen (2–3 LR ≥ 30 km; P4: ≥ 2 LR ≥ 24 km), HM nicht", () => {
      const weeks = [plainWeek, plainWeek, plainWeek, plainWeek];
      expect(longRunSchedule(weeks, { startKm: 24, peakKm: 30, distance: "m", runDays: 6 })).toEqual([24, 27, 30, 30]);
      expect(longRunSchedule(weeks, { startKm: 24, peakKm: 30, distance: "m", runDays: 4 })).toEqual([24, 27, 30, 30]);
      expect(longRunSchedule(weeks, { startKm: 15, peakKm: 18, distance: "hm", runDays: 5 })).toEqual([15, 16, 17, 18]);
    });

    it("folgt eine Plateau-Woche auf eine Entlastung, beginnt das Plateau vor der Entlastung (I9-Ausnahme)", () => {
      const recovery: LongRunWeek = { hasLongRun: true, isRecoveryWeek: true, taper: false };
      const weeks = [plainWeek, plainWeek, plainWeek, recovery, plainWeek, plainWeek];
      expect(longRunSchedule(weeks, { startKm: 20, peakKm: 26, distance: "m", runDays: 4 })).toEqual([20, 23, 26, null, 26, 26]);
    });

    it("Startwert über dem Ziel: Ziel von Anfang an", () => {
      expect(longRunSchedule([plainWeek, plainWeek], { startKm: 20, peakKm: 16, distance: "hm", runDays: 5 })).toEqual([16, 16]);
    });
  });

  describe("Grenzen je Woche aus dem Verlauf davor", () => {
    const base = { runDays: 5 as const, weekKm: 60, ePaceSecPerKm: 338, startCapKm: 15.5, hardMinKm: 2.7 };

    it("erster Long Run höchstens längster Lauf + 2 km", () => {
      expect(longRunLimitKm(INITIAL_LONG_RUN_STATE, { ...base, desired: 18, isRecoveryWeek: false, taper: false }).km).toBe(15.5);
    });

    it("Steigerung zur letzten LR begrenzt, Wunschwert und Anteil auch", () => {
      const state: LongRunState = { last: 16, level: 16, longest: 16, afterRecovery: false };
      expect(longRunLimitKm(state, { ...base, desired: 20, isRecoveryWeek: false, taper: false }).km).toBe(18.4);
      expect(longRunLimitKm(state, { ...base, desired: 17, isRecoveryWeek: false, taper: false }).km).toBe(17);
      expect(longRunLimitKm(state, { ...base, weekKm: 40, desired: 20, isRecoveryWeek: false, taper: false }).km).toBe(15.2);
    });

    it("Entlastung −25 % zur letzten LR, danach höchstens das Niveau davor (I9-Ausnahme)", () => {
      const before: LongRunState = { last: 20, level: 20, longest: 20, afterRecovery: false };
      const recovery = longRunLimitKm(before, { ...base, desired: null, isRecoveryWeek: true, taper: false });
      expect(recovery.km).toBe(15);
      const after = advanceLongRun(before, { isRecoveryWeek: true, taper: false }, recovery.km);
      expect(after).toEqual({ last: 15, level: 20, longest: 20, afterRecovery: true });
      expect(longRunLimitKm(after, { ...base, desired: 22, isRecoveryWeek: false, taper: false }).km).toBe(20);
    });

    it("Taper: höchstens 60 % des längsten Long Runs (Folgepunkt b)", () => {
      const state: LongRunState = { last: 20, level: 20, longest: 20, afterRecovery: false };
      const taper = longRunLimitKm(state, { ...base, weekKm: 43, desired: null, isRecoveryWeek: false, taper: true });
      expect(taper).toEqual({ km: 12, taperCut: true, raisedToMinimum: false });
      expect(CONFIG.taper.longRunShareOfPeak.value).toBe(0.6);
    });

    it("harte Untergrenze (15 min, Review-Punkt 34): liegt die Grenze darunter, gilt die Untergrenze (Hinweis)", () => {
      // längster Lauf 0 km → erster Long Run höchstens 2 km, bei 5:38/km sind 15 min 2,7 km
      const first = longRunLimitKm(INITIAL_LONG_RUN_STATE, { ...base, startCapKm: 2, desired: 10, isRecoveryWeek: false, taper: false });
      expect(first).toEqual({ km: 2.7, taperCut: false, raisedToMinimum: true });
      const state: LongRunState = { last: 4, level: 4, longest: 4, afterRecovery: false };
      expect(longRunLimitKm(state, { ...base, desired: null, isRecoveryWeek: false, taper: true })).toEqual({ km: 2.7, taperCut: false, raisedToMinimum: true });
      expect(longRunLimitKm(state, { ...base, desired: 5, isRecoveryWeek: false, taper: false }).raisedToMinimum).toBe(false);
    });
  });
});
