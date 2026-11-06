import { CONFIG } from "../config";
import { addDays, mondayOf } from "../dates";
import { PROFILES } from "../__fixtures__/profiles";
import { isPlanCoreError } from "../phases";
import { createRng } from "../random";
import type { Distance, RunDays, Ymd } from "../types";
import { codesOf, unreasoned } from "../__fixtures__/compact";
import { checkVolume } from "../invariants";
import { planVolume } from "../volume";
import type { PlanVolume, VolumeInputs, VolumeOptions } from "../volume";

const EPS = 1e-9;
const DISTANCES: Distance[] = ["5k", "10k", "hm", "m"];
const RUN_DAYS: RunDays[] = [3, 4, 5, 6];

/** Sonntag, 14.3.2027. */
const RACE_SUNDAY: Ymd = "2027-03-14";

function inputsFor(
  distance: Distance,
  runDaysPerWeek: RunDays,
  currentWeeklyKm: number,
  weeks: number,
  raceDate: Ymd = RACE_SUNDAY,
  startOffset = 0,
): VolumeInputs {
  return {
    distance,
    runDaysPerWeek,
    currentWeeklyKm,
    raceDate,
    startYmd: addDays(mondayOf(raceDate), -7 * (weeks - 1) + startOffset),
  };
}

/**
 * Prüft §5 / I3–I5 / Teil von I13 und die Struktur der Wochenliste mit `checkVolume` (invariants.ts); leer = alles
 * gehalten. Zusätzlich die genaue Entlastungstiefe des geplanten Werts (`curveKm`, vor Tragfähigkeit und Senken):
 * −20 % der gelieferten Vorwoche abgerundet, bei winzigen Umfängen die I3-Untergrenze auf 0,1 km, nie über der Vorwoche.
 */
function violations(inputs: VolumeInputs, volume: PlanVolume): string[] {
  const out = codesOf(unreasoned(checkVolume(volume, inputs)));
  const { growth, recovery } = CONFIG.volume;
  const pre = volume.weeks.filter((week) => week.wn <= volume.peakWeek);
  pre.forEach((week, i) => {
    if (!week.isRecoveryWeek || i === 0) return;
    const previous = pre[i - 1].fullWeekKm;
    const depth = Math.min(
      previous,
      Math.max(Math.floor(previous * (1 - recovery.reduction.value) + EPS), Math.ceil((previous / growth.twoWeekFactor.value) * 10 - EPS) / 10),
    );
    if (week.curveKm !== depth) out.push(`Entlastung w${week.wn}`);
  });
  return out;
}

describe("planCore volume (§5)", () => {
  describe("Referenzprofile P1–P6: Peak im Bereich aus §13", () => {
    const profiles: Array<[string, VolumeInputs, [number, number]]> = [
      ["P1 5k Anfänger", inputsFor("5k", 3, 10, 8), [13, 15]],
      ["P2 10k Finisher", inputsFor("10k", 4, 20, 10), [28, 35]],
      ["P3 HM 1:35", inputsFor("hm", 5, 45, 12), [55, 65]],
      ["P4 M 4:00", inputsFor("m", 4, 35, 16), [50, 55]],
      ["P5 M 2:50", inputsFor("m", 6, 70, 18), [95, 105]],
      ["P6 M 3 Tage", inputsFor("m", 3, 30, 18), [40, 45]],
    ];

    it.each(profiles)("%s", (_name, inputs, [min, max]) => {
      const volume = planVolume(inputs);
      expect(volume.peakKm).toBeGreaterThanOrEqual(min);
      expect(volume.peakKm).toBeLessThanOrEqual(max);
      expect(volume.peakKm).toBeLessThanOrEqual(volume.targetPeakKm);
      expect(volume.notes.filter((note) => note.code === "peak-not-reached")).toEqual([]);
      expect(violations(inputs, volume)).toEqual([]);
    });

    it("P3: das weiche Ziel 62 km scheitert an I3 nach der Entlastung in Woche 8, ohne Hinweis (Peak 61 liegt im Korridor)", () => {
      const volume = planVolume(profiles[2][1]);
      expect(volume.targetPeakKm).toBe(62);
      expect(volume.peakKm).toBe(61);
      expect(volume.notes).toEqual([]);
    });

    it("P5 bleibt unter 110 km, auch mit Peak-Position 1", () => {
      expect(planVolume(profiles[4][1], { peakPosition: 1 }).peakKm).toBeLessThanOrEqual(110);
    });

    it("die Zahlen der Referenzprofile sind festgeschrieben", () => {
      expect(profiles.map(([, inputs]) => planVolume(inputs).peakKm)).toEqual([15, 30, 61, 50, 96, 43]);
    });
  });

  describe("Peak-Korridor und Peak-Position", () => {
    it("I5: nie über 1,5 × Start (P1: 10 km → 15 km) und nie über dem Tabellenmaximum", () => {
      expect(planVolume(inputsFor("5k", 3, 10, 8), { peakPosition: 1 }).peakKm).toBe(15);
      expect(planVolume(inputsFor("m", 3, 100, 18), { peakPosition: 1 }).peakKm).toBe(50);
    });

    it("Position 0 = Untergrenze, 1 = Obergrenze, Standard 0,75", () => {
      const inputs = inputsFor("hm", 5, 45, 12);
      expect(planVolume(inputs, { peakPosition: 0 }).peakKm).toBe(45);
      const high = planVolume(inputs, { peakPosition: 1 });
      expect(high.targetPeakKm).toBe(67);
      // Entlastung in Woche 8 und I3 lassen Woche 10 nur auf 61 km steigen
      expect(high.peakKm).toBe(61);
      expect(planVolume(inputs).peakKm).toBe(planVolume(inputs, { peakPosition: CONFIG.volume.peakPosition.value }).peakKm);
      expect(CONFIG.volume.peakPosition.value).toBe(0.75);
    });

    it("Position außerhalb 0–1 wird abgelehnt", () => {
      const inputs = inputsFor("hm", 5, 45, 12);
      [-0.1, 1.1, NaN].forEach((peakPosition) => {
        expect(() => planVolume(inputs, { peakPosition })).toThrow(/invalid-input/);
      });
    });

    it("hoher Ist-Umfang: Woche 1 und Peak sind auf die Obergrenze begrenzt", () => {
      const volume = planVolume(inputsFor("5k", 3, 90, 8));
      expect(volume.peakCorridor).toEqual({ min: 30, max: 30 });
      expect(volume.weeks[0].fullWeekKm).toBe(30);
      expect(volume.peakKm).toBe(30);
    });
  });

  describe("Steigerung (I3, I4) und Entlastung", () => {
    it("Entlastung fest −20 % in Woche 4, 8, 12 – danach höchstens das Niveau davor", () => {
      const volume = planVolume(inputsFor("m", 4, 35, 16));
      const recovery = volume.weeks.filter((week) => week.isRecoveryWeek).map((week) => week.wn);
      expect(recovery).toEqual([4, 8, 12]);
      recovery.forEach((wn) => {
        const before = volume.weeks[wn - 2].fullWeekKm;
        expect(volume.weeks[wn - 1].fullWeekKm).toBe(Math.round(before * 0.8));
        expect(volume.weeks[wn].fullWeekKm).toBeLessThanOrEqual(before);
        // I3: nach der Entlastung ist das alte Niveau wieder erreichbar, ohne Rückgang
        expect(volume.weeks[wn + 1].fullWeekKm).toBeGreaterThanOrEqual(volume.weeks[wn].fullWeekKm);
      });
    });

    it("keine Entlastung in den letzten zwei Wochen vor dem Taper (8 Wochen M: Woche 4 ja, Woche 8 ist Taper)", () => {
      const volume = planVolume(inputsFor("m", 5, 55, 8));
      expect(volume.weeks.filter((week) => week.isRecoveryWeek).map((week) => week.wn)).toEqual([4]);
    });

    it("Spitze nicht erreichbar: Hinweis peak-not-reached, die Regeln halten trotzdem", () => {
      const inputs = inputsFor("m", 6, 25, 8);
      const volume = planVolume(inputs, { peakPosition: 1 });
      const note = volume.notes.find((n) => n.code === "peak-not-reached");
      expect(note).toEqual({
        code: "peak-not-reached",
        reason: "growth",
        targetPeakKm: volume.targetPeakKm,
        reachedPeakKm: volume.peakKm,
      });
      expect(volume.peakKm).toBeLessThan(volume.targetPeakKm);
      expect(violations(inputs, volume)).toEqual([]);
    });

    it("Hinweis nur bei mehr als 10 % unter dem Ziel: 1,6 % (P3) ohne, 7 Wochen P1 (13 statt 15) mit", () => {
      const p3 = planVolume(inputsFor("hm", 5, 45, 12));
      expect(p3.peakKm).toBeLessThan(p3.targetPeakKm);
      expect(p3.notes.filter((note) => note.code === "peak-not-reached")).toEqual([]);

      const p1Short = planVolume(inputsFor("5k", 3, 10, 7));
      expect(p1Short.targetPeakKm).toBe(15);
      expect(p1Short.peakKm).toBe(13);
      expect(p1Short.notes).toContainEqual({ code: "peak-not-reached", reason: "growth", targetPeakKm: 15, reachedPeakKm: 13 });
    });

    it("Hinweis folgt der Schwelle peakShortfallNote (10 %); der Property-Test prüft das für alle Zufallsfälle", () => {
      const threshold = CONFIG.volume.peakShortfallNote.value;
      expect(threshold).toBe(0.1);
      const inputs = inputsFor("m", 6, 25, 8);
      const volume = planVolume(inputs, { peakPosition: 1 });
      const flagged = volume.notes.some((note) => note.code === "peak-not-reached");
      expect(flagged).toBe(volume.peakKm < volume.targetPeakKm * (1 - threshold) - EPS);
    });

    it("0 km Ist-Umfang: Woche 1 hat mindestens weekOneMinKm, die Kurve wächst", () => {
      const inputs = inputsFor("10k", 3, 0, 10);
      const volume = planVolume(inputs);
      expect(volume.weeks[0].fullWeekKm).toBe(CONFIG.volume.weekOneMinKm.value);
      expect(volume.peakKm).toBeGreaterThan(volume.weeks[0].fullWeekKm);
      expect(violations(inputs, volume)).toEqual([]);
    });

    it("angebrochene Woche 1: targetKm anteilig, die Kurve rechnet mit der vollen Woche", () => {
      const inputs = inputsFor("hm", 4, 40, 12, RACE_SUNDAY, 5);
      const volume = planVolume(inputs);
      const first = volume.weeks[0];
      expect(first.days).toBe(2);
      expect(first.fullWeekKm).toBe(40);
      expect(first.targetKm).toBe(Math.round((40 * 2) / 7));
      expect(volume.weeks[1].fullWeekKm).toBeGreaterThan(first.targetKm);
      expect(violations(inputs, volume)).toEqual([]);
    });
  });

  describe("Taper und Rennwoche (§5.4)", () => {
    it("M, Peak 96: Taper-Woche 1 = 70 %, Rennwoche = Rennen + 42,5 % (ohne Rennen)", () => {
      const volume = planVolume(inputsFor("m", 6, 70, 18));
      expect(volume.peakKm).toBe(96);
      const [t1, race] = volume.weeks.slice(-2);
      expect(t1.fullWeekKm).toBe(Math.round(96 * 0.7));
      expect(race.raceWeekExtraKm).toBe(Math.round(96 * 0.425));
      expect(race.targetKm).toBe(42.2 + Math.round(96 * 0.425));
      // −43,75 % über die Taper-Phase
      expect(1 - (t1.fullWeekKm + race.fullWeekKm) / (2 * 96)).toBeGreaterThan(0.41);
      expect(1 - (t1.fullWeekKm + race.fullWeekKm) / (2 * 96)).toBeLessThan(0.6);
    });

    it("10k: eine Taper-Woche = Rennwoche mit 50 % des Peaks ohne Rennen", () => {
      const volume = planVolume(inputsFor("10k", 4, 20, 10));
      const race = volume.weeks[volume.weeks.length - 1];
      expect(volume.taperWeeks).toBe(1);
      expect(race.raceWeekExtraKm).toBe(Math.round(volume.peakKm * 0.5));
      expect(race.targetKm).toBe(10 + Math.round(volume.peakKm * 0.5));
    });

    it("Rennen am Montag: Zusatz-Taper-Woche, Rennwoche besteht nur aus dem Rennen", () => {
      const inputs = inputsFor("m", 5, 55, 14, "2027-03-15");
      const volume = planVolume(inputs);
      const race = volume.weeks[volume.weeks.length - 1];
      expect(volume.taperWeeks).toBe(3);
      expect(race.days).toBe(1);
      expect(race.raceWeekExtraKm).toBe(0);
      expect(race.targetKm).toBe(42.2);
      expect(violations(inputs, volume)).toEqual([]);
    });

    it.each([
      ["Freitag", "2027-03-12", 5],
      ["Samstag", "2027-03-13", 6],
    ])("Rennwoche mit Rennen am %s (%i Tage): keine Zusatz-Taper-Woche, Rest ohne Rennen anteilig", (_name, raceDate, days) => {
      const inputs = inputsFor("hm", 5, 50, 14, raceDate);
      const volume = planVolume(inputs);
      const race = volume.weeks[volume.weeks.length - 1];
      expect(race.days).toBe(days);
      expect(volume.taperWeeks).toBe(2);
      expect(race.raceWeekExtraKm).toBe(Math.round(volume.peakKm * 0.425 * ((days - 1) / 6)));
      expect(violations(inputs, volume)).toEqual([]);
    });

    it("Rennwoche mit 3 Tagen: Rest ohne Rennen anteilig zu den Tagen vor dem Rennen", () => {
      const volume = planVolume(inputsFor("hm", 5, 50, 14, "2027-03-17"));
      const race = volume.weeks[volume.weeks.length - 1];
      expect(race.days).toBe(3);
      expect(race.raceWeekExtraKm).toBe(Math.round(volume.peakKm * 0.425 * (2 / 6)));
    });
  });

  describe("Tragfähigkeit (capacity, freigegeben 2026-11-05)", () => {
    const p3 = PROFILES.filter((p) => p.name === "P3")[0].inputs;

    it("plant höchstens das Lieferbare, die Steigerung rechnet mit den gelieferten Werten, curveKm hält den Plan davor", () => {
      const calls: number[] = [];
      const volume = planVolume(p3, {
        capacity: {
          begin: () => {
            calls.length = 0;
            return {
              deliver: (index: number, km: number) => {
                calls.push(index);
                return Math.min(km, 50);
              },
            };
          },
        },
      });
      const plain = planVolume(p3);
      const problems = volume.weeks.filter(
        (w, i) =>
          w.fullWeekKm > 50 ||
          w.curveKm < w.fullWeekKm ||
          (i >= 2 && w.wn <= volume.peakWeek && w.fullWeekKm > Math.floor(1.3 * volume.weeks[i - 2].fullWeekKm)),
      );
      expect(problems).toEqual([]);
      expect(volume.peakKm).toBe(50);
      expect(volume.notes).toContainEqual({ code: "peak-not-reached", reason: "run-days", targetPeakKm: plain.targetPeakKm, reachedPeakKm: 50 });
      // je Woche genau ein Aufruf, in Reihenfolge, Taper- und Rennwoche eingeschlossen
      expect(calls).toEqual(volume.weeks.map((_, i) => i));
      // Taper relativ zum gelieferten Peak
      expect(volume.weeks[volume.weeks.length - 2].curveKm).toBe(Math.round(50 * 0.7));
    });

    /** P3 mit Tragfähigkeit `caps` (Index → km), sonst unbegrenzt. */
    const cappedP3 = (caps: Record<number, number>) =>
      planVolume(p3, { capacity: { begin: () => ({ deliver: (index: number, km: number) => Math.min(km, caps[index] ?? 1000) }) } });
    /** Monoton (freigegeben 2026-11-05): keine Aufbauwoche kleiner als die Vorwoche, Entlastung −20 bis −30 %, Peak zuletzt. */
    const monotoneProblems = (volume: PlanVolume): string[] => {
      const pre = volume.weeks.filter((w) => w.wn <= volume.peakWeek);
      const out: string[] = [];
      pre.forEach((w, i) => {
        if (i === 0) return;
        const prev = pre[i - 1].fullWeekKm;
        if (w.isRecoveryWeek && !(w.fullWeekKm >= 0.7 * prev - EPS && w.fullWeekKm <= 0.8 * prev + EPS)) out.push(`band w${w.wn}`);
        if (!w.isRecoveryWeek && w.fullWeekKm < prev - EPS) out.push(`drop w${w.wn}`);
      });
      if (volume.peakKm !== pre[pre.length - 1].fullWeekKm) out.push("peak not last");
      return out;
    };

    it("monotoner Verlauf: eine Delle senkt nur frühere Wochen, spätere wachsen weiter", () => {
      // Woche 9 trägt nur 44 km (P3 ohne Tragfähigkeit: 59).
      const volume = cappedP3({ 8: 44 });
      expect(monotoneProblems(volume)).toEqual([]);
      // Ausgenommen: das Taper-Mittel (der Taper bezieht sich auf den gesenkten Peak der Delle nicht).
      expect(violations(p3, volume).filter((code) => code.indexOf("I13/") < 0)).toEqual([]);
      volume.weeks.slice(0, 9).forEach((w) => expect([w.wn, w.fullWeekKm <= 44]).toEqual([w.wn, true]));
      expect(volume.weeks[0].fullWeekKm).toBeLessThan(volume.weeks[0].curveKm);
      expect(volume.peakKm).toBeGreaterThan(44);
    });

    it("Entlastung höchstens −30 % zur gelieferten Vorwoche: sonst wird die Woche davor gesenkt (und mit ihr die früheren)", () => {
      // Entlastungswoche 4 trägt nur 30 km (P3 ohne Tragfähigkeit: Woche 3 = 53, Woche 4 = 42).
      const volume = cappedP3({ 3: 30 });
      expect(monotoneProblems(volume)).toEqual([]);
      expect(volume.weeks[3].fullWeekKm).toBe(30);
      expect(volume.weeks[2].fullWeekKm).toBeLessThanOrEqual(Math.floor((30 / 0.7) * 10) / 10);
      // I3 (≤ 1,3 × Woche −2) hält die Woche 6 bei 1,3 × 30 = 39: tiefer als −23 % senkt die Entlastung so auch das Niveau danach.
      expect(volume.weeks[5].fullWeekKm).toBeLessThanOrEqual(39);
    });

    it("ohne capacity ist curveKm = fullWeekKm", () => {
      planVolume(p3).weeks.forEach((w) => expect(w.curveKm).toBe(w.fullWeekKm));
    });
  });

  describe("Plan-Hinweise und Fehler", () => {
    it("zu kurzer Plan: Fehler mit Code", () => {
      expect(() => planVolume(inputsFor("m", 4, 40, 7))).toThrow(/plan-too-short/);
    });

    it("unter der Empfehlung: Hinweis, kein Fehler", () => {
      const volume = planVolume(inputsFor("m", 4, 40, 9));
      expect(volume.notes).toContainEqual({ code: "below-recommended", weeks: 9, recommendedMinWeeks: 12 });
    });

    it("über dem Maximum: Hinweis plan-trimmed", () => {
      const volume = planVolume(inputsFor("5k", 3, 12, 20));
      expect(volume.weeks).toHaveLength(16);
      expect(volume.notes).toContainEqual({ code: "plan-trimmed", freeWeeks: 4 });
    });

    it("ungültige Eingaben werden mit Code abgelehnt", () => {
      const ok = inputsFor("10k", 4, 20, 10);
      const code = (inputs: unknown): string | null => {
        try {
          planVolume(inputs as VolumeInputs);
        } catch (error) {
          return isPlanCoreError(error) ? error.code : "other";
        }
        return null;
      };
      expect(code({ ...ok, runDaysPerWeek: 2 })).toBe("invalid-input");
      expect(code({ ...ok, runDaysPerWeek: 7 })).toBe("invalid-input");
      expect(code({ ...ok, runDaysPerWeek: 4.5 })).toBe("invalid-input");
      expect(code({ ...ok, currentWeeklyKm: -1 })).toBe("invalid-input");
      expect(code({ ...ok, currentWeeklyKm: 151 })).toBe("invalid-input");
      expect(code({ ...ok, currentWeeklyKm: NaN })).toBe("invalid-input");
      expect(code({ ...ok, distance: "ultra" })).toBe("invalid-input");
    });

    it("ist deterministisch (I20) und verändert die Eingaben nicht", () => {
      const inputs = inputsFor("hm", 5, 47.5, 13, "2027-05-19", 3);
      const copy = JSON.parse(JSON.stringify(inputs));
      expect(planVolume(inputs)).toEqual(planVolume(inputs));
      expect(inputs).toEqual(copy);
    });
  });

  describe("Property-Test", () => {
    const SEED = 20261104;
    const CASES = 2000;

    it(`${CASES} zufällige gültige Eingaben halten I3, I4, I5 und das Taper-Volumen (Seed ${SEED})`, () => {
      const rng = createRng(SEED);
      const failures: string[] = [];
      let notReached = 0;

      for (let n = 0; n < CASES; n += 1) {
        const distance = rng.pick(DISTANCES);
        const runDays = rng.pick(RUN_DAYS);
        const weeks = rng.int(CONFIG.planLength.hardMinWeeks.value[distance], CONFIG.planLength.maxWeeks.value[distance] + 3);
        const raceDate = addDays("2027-01-03", rng.int(0, 400));
        const currentWeeklyKm = rng.chance(0.2) ? rng.int(0, 15) : rng.chance(0.5) ? rng.int(0, 150) : Math.round(rng.next() * 1500) / 10;
        const options: VolumeOptions = rng.chance(0.5) ? {} : { peakPosition: Math.round(rng.next() * 100) / 100 };
        const inputs = inputsFor(distance, runDays, currentWeeklyKm, weeks, raceDate, rng.int(0, 6));

        const volume = planVolume(inputs, options);
        const found = violations(inputs, volume);
        if (found.length > 0) failures.push(`${JSON.stringify(inputs)} ${JSON.stringify(options)} → ${found.join(", ")}`);
        const flagged = volume.notes.some((note) => note.code === "peak-not-reached");
        if (flagged) notReached += 1;
        const farBelowTarget = volume.peakKm < volume.targetPeakKm * (1 - CONFIG.volume.peakShortfallNote.value) - EPS;
        if (flagged !== farBelowTarget) {
          failures.push(`Hinweis passt nicht zum Abstand: ${JSON.stringify(inputs)}`);
        }
        if (JSON.stringify(volume) !== JSON.stringify(planVolume(inputs, options))) failures.push(`nicht deterministisch: ${JSON.stringify(inputs)}`);
      }

      expect(failures.slice(0, 5)).toEqual([]);
      // Die meisten Pläne erreichen ihre Spitze; sonst wäre die Kurve zu zaghaft.
      expect(notReached).toBeLessThan(CASES * 0.5);
    });
  });
});
