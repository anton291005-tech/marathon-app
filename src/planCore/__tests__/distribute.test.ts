import { distributeFillers, minWeekKm } from "../distribute";
import type { Filler } from "../distribute";
import { randomInputs } from "../__fixtures__/randomInputs";
import { PROFILES } from "../__fixtures__/profiles";
import type { ProfileName } from "../__fixtures__/profiles";
import { buildPaceProfile } from "../pace";
import { CONFIG } from "../config";
import { createRng } from "../random";
import { planVolume } from "../volume";
import { sessionPacesOf } from "../sessions";
import type { SessionPaces } from "../sessions";
import type { CoreInputs } from "../types";

function pacesOf(name: ProfileName): SessionPaces {
  const profile = PROFILES.filter((p) => p.name === name)[0];
  return sessionPacesOf(buildPaceProfile(profile.inputs, profile.todayYmd), profile.inputs.distance);
}

const sumTenths = (values: number[]): number => values.reduce((total, value) => total + Math.round(value * 10), 0);

describe("planCore distribute (§6)", () => {
  describe("Mindest-Wochen-km (Folgepunkt minWeekKmPerRunDay)", () => {
    it("Lauftage × E 25 min, aufgerundet (E darf bis zur Länge des Long Runs gehen, freigegeben 2026-11-05)", () => {
      // P1: E 7:00 → 3,6 km; 3 × 3,6 = 10,8 → 11
      expect(minWeekKm(3, pacesOf("P1"))).toBe(11);
      // P3: E 5:38 → 4,5 km; 5 × 4,5 = 22,5 → 23
      expect(minWeekKm(5, pacesOf("P3"))).toBe(23);
      expect(minWeekKm(6, pacesOf("P1"))).toBe(22);
    });
  });

  describe("Verteilung", () => {
    const e = (minKm: number, maxKm: number): Filler => ({ kind: "E", minKm, maxKm });

    it("gleiche Gewichte → gleiche km, letzte Zehntel an den früheren Füller", () => {
      expect(distributeFillers([e(4, 13), e(4, 13), e(4, 13)], 27.8)).toEqual({ km: [9.3, 9.3, 9.2], status: "ok" });
    });

    it("REC 0,8, MLR 2 relativ zu E", () => {
      const result = distributeFillers(
        [{ kind: "REC", minKm: 3.8, maxKm: 8.5 }, { kind: "MLR", minKm: 15.7, maxKm: 22.9 }, e(5.3, 18.8)],
        38.2,
      );
      expect(result.status).toBe("ok");
      expect(sumTenths(result.km)).toBe(382);
      expect(result.km[1]).toBeGreaterThan(result.km[2]);
      expect(result.km[0]).toBeLessThan(result.km[2]);
    });

    it("Grenzen: ein Füller am Höchstwert, der Rest geht an die anderen", () => {
      expect(distributeFillers([e(4, 6), e(4, 20)], 20)).toEqual({ km: [6, 14], status: "ok" });
    });

    it("zu viel Rest → alle am Höchstwert, Woche kleiner; zu wenig → alle am Mindestwert", () => {
      expect(distributeFillers([e(4, 6), e(4, 6)], 15)).toEqual({ km: [6, 6], status: "reduced" });
      expect(distributeFillers([e(4, 6), e(4, 6)], 7)).toEqual({ km: [4, 4], status: "raised" });
      expect(distributeFillers([], 0)).toEqual({ km: [], status: "ok" });
      expect(distributeFillers([], 2)).toEqual({ km: [], status: "reduced" });
    });

    it("Property: Summe exakt in Zehnteln, jeder Füller in seinen Grenzen (2 000 Fälle)", () => {
      const rng = createRng(20261106);
      const kinds = ["E", "REC", "MLR"] as const;
      const problems: string[] = [];
      for (let index = 0; index < 2000; index += 1) {
        const fillers: Filler[] = [];
        const count = rng.int(1, 5);
        for (let k = 0; k < count; k += 1) {
          const min = rng.int(20, 80) / 10;
          fillers.push({ kind: rng.pick(kinds), minKm: min, maxKm: min + rng.int(0, 150) / 10 });
        }
        const rest = rng.int(0, 900) / 10;
        const result = distributeFillers(fillers, rest);
        result.km.forEach((km, k) => {
          if (km < fillers[k].minKm - 1e-9 || km > Math.max(fillers[k].minKm, fillers[k].maxKm) + 1e-9) problems.push(`${index}:bounds`);
        });
        const diff = sumTenths(result.km) - Math.round(rest * 10);
        const expectedSign = result.status === "ok" ? 0 : result.status === "reduced" ? -1 : 1;
        if (Math.sign(diff) !== expectedSign) problems.push(`${index}:${result.status}:${diff}`);
      }
      expect(problems).toEqual([]);
    });
  });

  describe("planVolume mit minWeekKm (Änderung an Schritt 2, freigegeben)", () => {
    const p1 = PROFILES.filter((p) => p.name === "P1")[0].inputs;

    it("P1: Woche 1 von 10 auf 12 km, Entlastung nicht unter 12, Hinweis min-week-km-raised", () => {
      const plain = planVolume(p1);
      const raised = planVolume(p1, { minWeekKm: 12 });
      expect(plain.weeks[0].fullWeekKm).toBe(10);
      expect(raised.weeks[0].fullWeekKm).toBe(12);
      raised.weeks
        .filter((week) => week.phase !== "taper")
        .forEach((week) => expect(week.fullWeekKm).toBeGreaterThanOrEqual(12));
      expect(raised.notes).toContainEqual({ code: "min-week-km-raised", minWeekKm: 12 });
      expect(plain.notes.filter((note) => note.code === "min-week-km-raised")).toEqual([]);
    });

    it("6 Tage bei 10 km Ist-Umfang: Korridor wird auf minWeekKm angehoben, I3/I4 halten", () => {
      const inputs: CoreInputs = { ...p1, runDaysPerWeek: 6 };
      const volume = planVolume(inputs, { minWeekKm: 23 });
      expect(volume.peakCorridor.max).toBe(23);
      const full = volume.weeks.filter((week) => week.wn <= volume.peakWeek).map((week) => week.fullWeekKm);
      const problems = full.filter(
        (km, index) => km < 23 || (index >= 2 && km > Math.floor(1.3 * full[index - 2] + 1e-9)),
      );
      expect(problems).toEqual([]);
    });

    it("liegt minWeekKm unter dem Ist-Umfang, ändert sich nichts", () => {
      const p3 = PROFILES.filter((p) => p.name === "P3")[0].inputs;
      expect(planVolume(p3, { minWeekKm: 24 })).toEqual(planVolume(p3));
    });

    it("Property (2 000 Fälle, Mindest-Wochen-km aus den Paces wie in planSessions): I3, I4, I5 mit minWeekKm, Entlastung", () => {
      const problems: string[] = [];
      let raised = 0;
      for (let index = 0; index < 2000; index += 1) {
        const { inputs, todayYmd } = randomInputs(20261107 + index);
        const paces = sessionPacesOf(buildPaceProfile(inputs, todayYmd), inputs.distance);
        const minWeek = minWeekKm(inputs.runDaysPerWeek, paces);
        const volume = planVolume(inputs, { minWeekKm: minWeek });
        if (volume.notes.some((note) => note.code === "min-week-km-raised")) raised += 1;
        const { volume: v } = CONFIG;
        const startKm = Math.min(Math.max(inputs.currentWeeklyKm, v.minStartKm.value[inputs.distance]), v.startKmMax.value);
        const cap = Math.floor(Math.min(v.peakKm.value[inputs.distance][inputs.runDaysPerWeek].max, startKm * v.peakStartFactor.value) + 1e-9);
        const full = volume.weeks.filter((w) => w.wn <= volume.peakWeek).map((w) => w.fullWeekKm);
        const rec = volume.weeks.filter((w) => w.wn <= volume.peakWeek).map((w) => w.isRecoveryWeek);
        let level = full[0];
        full.forEach((km, i) => {
          const tag = `${index}:W${i + 1}`;
          if (km < minWeek) problems.push(`${tag}:below-minWeek`);
          if (km > Math.max(cap, minWeek)) problems.push(`${tag}:I5`);
          const prev = i === 0 ? full[0] : full[i - 1];
          const prev2 = i < 2 ? full[0] : full[i - 2];
          if (km > Math.floor(1.3 * prev2 + 1e-9)) problems.push(`${tag}:I3`);
          if (rec[i]) {
            if (!(km < prev || km === minWeek)) problems.push(`${tag}:recovery-not-smaller`);
          } else if (i > 0 && rec[i - 1]) {
            if (km > level) problems.push(`${tag}:I4-after-recovery`);
          } else if (km > Math.floor(Math.max(prev * 1.1, prev + 4) + 1e-9)) problems.push(`${tag}:I4`);
          if (!rec[i]) level = km;
        });
      }
      expect(problems.slice(0, 10)).toEqual([]);
      expect(raised).toBeGreaterThan(50);
    });

    it("ungültiger Wert wird abgelehnt", () => {
      expect(() => planVolume(p1, { minWeekKm: -1 })).toThrow("invalid-input: minWeekKm");
    });
  });
});
