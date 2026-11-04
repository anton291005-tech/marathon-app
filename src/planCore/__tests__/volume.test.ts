import { CONFIG } from "../config";
import { addDays, diffDays, mondayOf } from "../dates";
import { isPlanCoreError } from "../phases";
import { createRng } from "../random";
import type { Distance, RunDays, Ymd } from "../types";
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

/** Prüft §5 / I3–I5 / Teil von I13 und die Struktur der Wochenliste; leer = alles gehalten. */
function violations(inputs: VolumeInputs, volume: PlanVolume): string[] {
  const out: string[] = [];
  const { weeks, peakWeek } = volume;
  const pre = weeks.filter((week) => week.wn <= peakWeek);
  const full = pre.map((week) => week.fullWeekKm);
  const { growth, recovery } = CONFIG.volume;

  // I3: km(w) ≤ 1,30 × km(w−2) für w ≥ 3
  for (let i = 2; i < full.length; i += 1) {
    if (full[i] > growth.twoWeekFactor.value * full[i - 2] + EPS) out.push(`I3 w${i + 1}`);
  }
  // I4: +10 % oder +4 km; nach der Entlastung höchstens das Niveau davor
  for (let i = 1; i < full.length; i += 1) {
    const previous = full[i - 1];
    if (pre[i].isRecoveryWeek) {
      const depth = Math.max(Math.round(previous * (1 - recovery.reduction.value)), Math.ceil(previous / growth.twoWeekFactor.value - EPS));
      if (full[i] !== depth) out.push(`Entlastung w${i + 1}`);
      continue;
    }
    const limit = pre[i - 1].isRecoveryWeek
      ? full[i - 2]
      : Math.max(previous * (1 + growth.weeklyShare.value), previous + growth.weeklyKm.value);
    if (full[i] > limit + EPS) out.push(`I4 w${i + 1}`);
    if (full[i] < previous - EPS) out.push(`Rückgang ohne Entlastung w${i + 1}`);
  }
  // Entlastung nur jede 4. Woche, nie in den letzten zwei Wochen vor dem Taper, nie in Woche 1
  pre.forEach((week) => {
    const expected = week.wn > 1 && week.wn % recovery.everyNWeeks.value === 0 && week.wn <= peakWeek - 2;
    if (week.isRecoveryWeek !== expected) out.push(`isRecoveryWeek w${week.wn}`);
  });
  // I5
  const table = CONFIG.volume.peakKm.value[inputs.distance][inputs.runDaysPerWeek];
  const startKm = Math.min(Math.max(inputs.currentWeeklyKm, CONFIG.volume.minStartKm.value[inputs.distance]), 150);
  const peakLimit = Math.min(table.max, startKm * CONFIG.volume.peakStartFactor.value);
  full.forEach((value, i) => {
    if (value > peakLimit + EPS) out.push(`I5 w${i + 1}`);
  });
  if (volume.peakKm !== Math.max.apply(null, full)) out.push("peakKm ist nicht das Maximum");
  if (full[peakWeek - 1] !== volume.peakKm) out.push("Peak liegt nicht in der Peak-Woche");
  // Woche 1 = min(Ist, Obergrenze), mindestens weekOneMinKm
  const weekOne = Math.max(CONFIG.volume.weekOneMinKm.value, Math.min(Math.round(inputs.currentWeeklyKm), volume.peakCorridor.max));
  if (full[0] !== weekOne) out.push("Woche 1");

  // Taper: nie über dem Peak, Reihenfolge fallend, Rennwoche zuletzt
  const taper = weeks.filter((week) => week.wn > peakWeek);
  if (taper.length !== volume.taperWeeks) out.push("Taper-Anzahl");
  const raceWeek = weeks[weeks.length - 1];
  taper.forEach((week) => {
    if (week.fullWeekKm > volume.peakKm) out.push(`Taper über Peak w${week.wn}`);
    if (week.isRecoveryWeek) out.push(`Taper als Entlastung w${week.wn}`);
  });
  for (let i = 1; i < taper.length; i += 1) {
    if (taper[i].fullWeekKm > taper[i - 1].fullWeekKm) out.push(`Taper steigt w${taper[i].wn}`);
  }
  const raceKm = CONFIG.scope.raceKm.value[inputs.distance];
  if (raceWeek.raceWeekExtraKm === undefined) out.push("raceWeekExtraKm fehlt");
  else if (Math.abs(raceWeek.targetKm - (raceKm + raceWeek.raceWeekExtraKm)) > 0.051) out.push("Rennwoche = Rennen + Rest");
  // I13 (Volumen): −41 bis −60 % gegenüber dem Peak über die Taper-Phase. Die Spec-Anteile gelten für eine volle
  // Rennwoche (Rennen am Sonntag); bei weniger Tagen wird der Rest ohne Rennen anteilig kleiner.
  if (raceWeek.days === 7) {
    const sum = taper.reduce((acc, week) => acc + week.fullWeekKm, 0);
    const reduction = 1 - sum / (taper.length * volume.peakKm);
    const tolerance = 1.5 / volume.peakKm;
    if (reduction < CONFIG.taper.totalReduction.value.min - tolerance) out.push(`Taper zu mild ${reduction.toFixed(3)}`);
    if (reduction > CONFIG.taper.totalReduction.value.max + tolerance) out.push(`Taper zu streng ${reduction.toFixed(3)}`);
  }

  // Wochenliste: lückenlos, endet am Renntag, Teilwochen anteilig
  weeks.forEach((week, i) => {
    if (week.wn !== i + 1) out.push("wn");
    if (week.targetKm < 0) out.push(`negative km w${week.wn}`);
    if (i > 0 && diffDays(week.firstDayYmd, weeks[i - 1].lastDayYmd) !== 1) out.push(`Lücke w${week.wn}`);
    if (week.wn < weeks.length && week.days < 7 && week.wn > 1) out.push(`Teilwoche mitten im Plan w${week.wn}`);
  });
  if (raceWeek.lastDayYmd !== inputs.raceDate) out.push("Ende != raceDate");
  if (weeks.length > CONFIG.planLength.maxWeeks.value[inputs.distance]) out.push("über Max");
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
