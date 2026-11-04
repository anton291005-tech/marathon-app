import { CONFIG } from "../config";
import { addDays } from "../dates";
import { isPlanCoreError } from "../phases";
import {
  buildPaceProfile,
  formatPace,
  formatPaceRange,
  predictRaceSeconds,
  trainingPaces,
  vdotFromRace,
  vdotPenalty,
} from "../pace";
import type { PaceInputs, PaceProfile } from "../pace";
import { createRng } from "../random";
import type { Distance, RecentRace, Ymd } from "../types";
import { DANIELS_REFERENCE } from "../__fixtures__/danielsReference";

const TOLERANCE = 2; // s/km
const DISTANCES: Distance[] = ["5k", "10k", "hm", "m"];
const TODAY: Ymd = "2026-11-04";
const km = (distance: Distance): number => CONFIG.scope.raceKm.value[distance];

/** Rennen vor `weeks` Wochen mit dem VDOT, der zu `timeSeconds` auf `distanceKm` gehört. */
function race(distanceKm: number, timeSeconds: number, weeksAgo: number): RecentRace {
  return { distanceKm, timeSeconds, dateYmd: addDays(TODAY, -7 * weeksAgo), estimated: false };
}

function asVdot(profile: PaceProfile): Extract<PaceProfile, { mode: "vdot" }> {
  if (profile.mode !== "vdot") throw new Error(`erwartet vdot, war ${profile.mode}`);
  return profile;
}

describe("planCore pace: Daniels-Tabelle (vdoto2.com, ±2 s/km)", () => {
  DANIELS_REFERENCE.forEach((row) => {
    describe(`VDOT ${row.vdot}`, () => {
      it("5k-Zeit ergibt den VDOT (±0,1)", () => {
        expect(Math.abs(vdotFromRace(5, row.raceSeconds["5k"]) - row.vdot)).toBeLessThanOrEqual(0.1);
      });

      DISTANCES.forEach((distance) => {
        it(`Rennzeit ${distance}`, () => {
          const predicted = predictRaceSeconds(row.vdot, km(distance));
          expect(Math.abs(predicted - row.raceSeconds[distance]) / km(distance)).toBeLessThanOrEqual(TOLERANCE);
        });
      });

      const paces = trainingPaces(row.vdot);

      it("M-Pace", () => {
        expect(Math.abs(paces.M - row.paces.m)).toBeLessThanOrEqual(TOLERANCE);
      });

      // VDOT 30: E/T/I/R stehen nicht in der Referenz (Rechner weicht dort von der Formel ab, Spec §14 Punkt 14).
      const { e, t, i, r } = row.paces;
      if (e && t !== undefined && i !== undefined && r !== undefined) {
        it("E liegt im Bereich des Rechners", () => {
          expect(paces.E).toBeGreaterThanOrEqual(e.fast - TOLERANCE);
          expect(paces.E).toBeLessThanOrEqual(e.slow + TOLERANCE);
        });
        it("T-Pace", () => {
          expect(Math.abs(paces.T - t)).toBeLessThanOrEqual(TOLERANCE);
        });
        it("I-Pace", () => {
          expect(Math.abs(paces.I - i)).toBeLessThanOrEqual(TOLERANCE);
        });
        it("R-Pace", () => {
          expect(Math.abs(paces.R - r)).toBeLessThanOrEqual(TOLERANCE);
        });
      }
    });
  });

  it("VDOT 30 ist nur mit Rennzeiten und M in der Referenz", () => {
    const row = DANIELS_REFERENCE.find((entry) => entry.vdot === 30);
    expect(row).toBeDefined();
    expect(Object.keys(row?.paces ?? {})).toEqual(["m"]);
  });

  it("Formel: Rennzeit → VDOT → Rennzeit ist stabil", () => {
    [18, 30, 45, 60, 75].forEach((vdot) => {
      DISTANCES.forEach((distance) => {
        const seconds = predictRaceSeconds(vdot, km(distance));
        expect(Math.abs(vdotFromRace(km(distance), seconds) - vdot)).toBeLessThan(1e-6);
      });
    });
  });
});

describe("planCore pace: Config-Anteile", () => {
  const { form } = CONFIG;
  it("liegen im Rahmen der Literatur-Bereiche", () => {
    const within = (value: number, range: { min: number; max: number }) => value >= range.min && value <= range.max;
    expect(within(form.eShare.value, form.vo2maxShare.value.E)).toBe(true);
    expect(within(form.tShare.value, form.vo2maxShare.value.T)).toBe(true);
    expect(within(form.iShare.value, form.vo2maxShare.value.I)).toBe(true);
  });
});

describe("planCore pace: Abschlag für alte Rennen", () => {
  it("12 Wochen zählen voll, danach −1 je angefangene 6 Wochen, höchstens −4", () => {
    const table: Array<[number, number]> = [
      [0, 0],
      [-10, 0], // Rennen in der Zukunft
      [84, 0], // 12 Wochen
      [85, 1],
      [126, 1], // 18 Wochen
      [127, 2],
      [168, 2], // 24 Wochen
      [169, 3],
      [210, 3],
      [211, 4],
      [420, 4], // 60 Wochen, gedeckelt
    ];
    table.forEach(([ageDays, expected]) => expect(vdotPenalty(ageDays)).toBe(expected));
  });

  it("wirkt im Profil auf den VDOT und erzeugt einen Hinweis", () => {
    const profile = asVdot(buildPaceProfile({ distance: "hm", recentRace: race(10, 2610, 60) }, TODAY));
    expect(profile.penalty).toBe(4);
    expect(profile.vdot).toBeCloseTo(profile.vdotRaw - 4, 9);
    expect(profile.notes).toContainEqual({ code: "race-aged", ageWeeks: 60, penalty: 4 });
  });

  it("ein frisches Rennen bekommt keinen Abschlag und keinen Hinweis", () => {
    const profile = asVdot(buildPaceProfile({ distance: "hm", recentRace: race(10, 2610, 12) }, TODAY));
    expect(profile.penalty).toBe(0);
    expect(profile.notes).toEqual([]);
  });

  it("eine Schätzzeit altert nicht", () => {
    const estimate: RecentRace = { distanceKm: 10, timeSeconds: 2610, dateYmd: null, estimated: true };
    const profile = asVdot(buildPaceProfile({ distance: "hm", recentRace: estimate }, TODAY));
    expect(profile.penalty).toBe(0);
    expect(profile.vdot).toBeCloseTo(profile.vdotRaw, 9);
  });

  it("ein Rennen in der Zukunft zählt als aktuell", () => {
    const profile = asVdot(buildPaceProfile({ distance: "hm", recentRace: race(10, 2610, -2) }, TODAY));
    expect(profile.penalty).toBe(0);
    expect(profile.notes).toEqual([]);
  });

  it("eine Schätzzeit gilt für jede gültige Distanz (Schritt 9 begrenzt die Eingabe auf 5k/10k)", () => {
    const estimate: RecentRace = { distanceKm: 21.0975, timeSeconds: 6000, dateYmd: null, estimated: true };
    expect(buildPaceProfile({ distance: "hm", recentRace: estimate }, TODAY).mode).toBe("vdot");
  });

  it("langsamere Paces durch den Abschlag", () => {
    const fresh = asVdot(buildPaceProfile({ distance: "hm", recentRace: race(10, 2610, 4) }, TODAY));
    const aged = asVdot(buildPaceProfile({ distance: "hm", recentRace: race(10, 2610, 40) }, TODAY));
    expect(aged.paces.T).toBeGreaterThan(fresh.paces.T);
    expect(aged.paces.E).toBeGreaterThan(fresh.paces.E);
  });
});

describe("planCore pace: Einsteiger-Modus", () => {
  it("ohne Rennangabe: nur E (7:00) und REC (E + 30 s)", () => {
    const profile = buildPaceProfile({ distance: "10k" }, TODAY);
    expect(profile.mode).toBe("beginner");
    expect(profile.paces).toEqual({ E: 420, REC: 450 });
    expect(profile.notes).toEqual([]);
  });

  it("ohne Rennangabe wird auch ein Ziel ignoriert", () => {
    const profile = buildPaceProfile({ distance: "m", goalTime: 4 * 3600 }, TODAY);
    expect(profile.mode).toBe("beginner");
  });

  const invalid: Array<[string, RecentRace, string]> = [
    ["Distanz zu kurz", { distanceKm: 1, timeSeconds: 300, dateYmd: "2026-10-01", estimated: false }, "distance"],
    ["Distanz zu lang", { distanceKm: 50, timeSeconds: 14000, dateYmd: "2026-10-01", estimated: false }, "distance"],
    ["Distanz NaN", { distanceKm: Number.NaN, timeSeconds: 1500, dateYmd: "2026-10-01", estimated: false }, "distance"],
    ["Zeit 0", { distanceKm: 5, timeSeconds: 0, dateYmd: "2026-10-01", estimated: false }, "time"],
    ["Zeit negativ", { distanceKm: 5, timeSeconds: -5, dateYmd: "2026-10-01", estimated: false }, "time"],
    ["Wettkampf ohne Datum", { distanceKm: 5, timeSeconds: 1500, dateYmd: null, estimated: false }, "date"],
    ["Datum kaputt", { distanceKm: 5, timeSeconds: 1500, dateYmd: "2026-02-30", estimated: false }, "date"],
    ["unmenschlich schnell", { distanceKm: 5, timeSeconds: 600, dateYmd: "2026-10-01", estimated: false }, "vdot-range"],
    ["extrem langsam", { distanceKm: 5, timeSeconds: 6000, dateYmd: "2026-10-01", estimated: false }, "vdot-range"],
  ];
  invalid.forEach(([label, recentRace, reason]) => {
    it(`unplausible Rennangabe (${label}) → Einsteiger-Modus mit recent-race-invalid`, () => {
      const profile = buildPaceProfile({ distance: "hm", recentRace }, TODAY);
      expect(profile.mode).toBe("beginner");
      expect(profile.notes).toEqual([{ code: "recent-race-invalid", reason }]);
    });
  });

  it("ein Rennen, das erst durch den Abschlag unter VDOT 20 fällt, gilt als unplausibel", () => {
    // 5 km in 41:00 ≈ VDOT 23, nach −4 → < 20
    const profile = buildPaceProfile({ distance: "hm", recentRace: race(5, 2460, 60) }, TODAY);
    expect(profile.mode).toBe("beginner");
    expect(profile.notes).toEqual([{ code: "recent-race-invalid", reason: "vdot-range" }]);
  });

  it("Grenzen des Gültigkeitsbereichs: 1,5 und 42,2 km sind gültig, VDOT 20 bis 85", () => {
    const edge = (distanceKm: number, vdot: number): RecentRace => ({
      distanceKm,
      timeSeconds: Math.round(predictRaceSeconds(vdot, distanceKm)),
      dateYmd: null,
      estimated: true,
    });
    const modeOf = (recentRace: RecentRace) => buildPaceProfile({ distance: "hm", recentRace }, TODAY).mode;
    expect(modeOf(edge(1.5, 40))).toBe("vdot");
    expect(modeOf(edge(42.2, 40))).toBe("vdot");
    expect(modeOf(edge(5, 20.1))).toBe("vdot");
    expect(modeOf(edge(5, 84.9))).toBe("vdot");
    expect(modeOf(edge(5, 19.9))).toBe("beginner");
    expect(modeOf(edge(5, 85.1))).toBe("beginner");
  });

  it("wirft nur bei kaputter Plandistanz oder kaputtem Datum", () => {
    const run = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error;
      }
      return null;
    };
    const badDistance = run(() => buildPaceProfile({ distance: "ultra" as unknown as Distance }, TODAY));
    const badToday = run(() => buildPaceProfile({ distance: "hm" }, "morgen"));
    expect(isPlanCoreError(badDistance)).toBe(true);
    expect(isPlanCoreError(badToday)).toBe(true);
  });
});

describe("planCore pace: Zielpace", () => {
  /** 10 km in 43:30 vor 4 Wochen (P3), VDOT ≈ 47,1. */
  const p3Race = race(10, 43 * 60 + 30, 4);
  const hmInputs = (goalTime: number | undefined): PaceInputs => ({ distance: "hm", recentRace: p3Race, goalTime });
  const form = asVdot(buildPaceProfile(hmInputs(undefined), TODAY));

  it("ohne Ziel: Renntempo aus der Form", () => {
    expect(form.racePace.source).toBe("form");
    expect(form.goal).toBeNull();
    expect(form.racePace.secPerKm).toBe(Math.round(predictRaceSeconds(form.vdot, km("hm")) / km("hm")));
  });

  it("Lücke ≤ 2: Zielpace gilt", () => {
    const goalTime = 95 * 60; // HM 1:35 → VDOT ≈ 47,9, Lücke ≈ 0,8
    const profile = asVdot(buildPaceProfile(hmInputs(goalTime), TODAY));
    expect(profile.goal?.used).toBe(true);
    expect(profile.goal?.gapVdot).toBeGreaterThan(0);
    expect(profile.goal?.gapVdot).toBeLessThanOrEqual(2);
    expect(profile.racePace).toMatchObject({ source: "goal", secPerKm: Math.round(goalTime / km("hm")) });
    expect(profile.notes).toEqual([]);
  });

  it("Lücke > 2: Renntempo aus der Form und Hinweis mit Differenz in Sekunden", () => {
    const goalTime = 85 * 60; // HM 1:25 → VDOT ≈ 55
    const profile = asVdot(buildPaceProfile(hmInputs(goalTime), TODAY));
    expect(profile.goal?.used).toBe(false);
    expect(profile.goal?.gapVdot).toBeGreaterThan(2);
    expect(profile.racePace).toEqual(form.racePace);
    // „Ziel liegt aktuell X min über deiner Form“: Formzeit − Zielzeit, positiv
    const gapSeconds = predictRaceSeconds(profile.vdot, km("hm")) - goalTime;
    expect(gapSeconds).toBeGreaterThan(0);
    expect(profile.notes).toEqual([{ code: "goal-above-form", gapVdot: profile.goal?.gapVdot, gapSeconds }]);
  });

  it("Ziel leichter als die Form: wird genutzt", () => {
    const goalTime = 105 * 60; // HM 1:45, deutlich leichter
    const profile = asVdot(buildPaceProfile(hmInputs(goalTime), TODAY));
    expect(profile.goal?.used).toBe(true);
    expect(profile.goal?.gapVdot).toBeLessThan(0);
    expect(profile.racePace.secPerKm).toBe(Math.round(goalTime / km("hm")));
    expect(profile.racePace.secPerKm).toBeGreaterThan(form.racePace.secPerKm);
  });

  it("Ziel langsamer als E wird auf E − 1 begrenzt", () => {
    const profile = asVdot(buildPaceProfile(hmInputs(3 * 3600), TODAY)); // 8:31/km, langsamer als E
    expect(profile.racePace.secPerKm).toBe(profile.paces.E - CONFIG.form.goalPaceMarginSecPerKm.value);
    expect(profile.notes).toEqual([
      { code: "goal-pace-clamped", fromSecPerKm: Math.round((3 * 3600) / km("hm")), secPerKm: profile.paces.E - 1 },
    ]);
  });

  it("absurd langsames Ziel: genutzt, aber auf E − 1 begrenzt", () => {
    const profile = asVdot(buildPaceProfile(hmInputs(1e9), TODAY));
    expect(profile.goal?.used).toBe(true);
    expect(profile.racePace.secPerKm).toBe(profile.paces.E - 1);
  });

  it("Marathon: Zielpace ersetzt M und bleibt strikt zwischen T und E", () => {
    const base = { distance: "m" as const, recentRace: race(21.0975, 81 * 60, 8) };
    const formProfile = asVdot(buildPaceProfile(base, TODAY));
    const easy = asVdot(buildPaceProfile({ ...base, goalTime: 5 * 3600 }, TODAY));
    expect(easy.racePace.source).toBe("goal");
    expect(easy.paces.M).toBe(easy.racePace.secPerKm);
    expect(easy.paces.M).toBeLessThan(easy.paces.E);
    expect(easy.paces.M).toBeGreaterThan(easy.paces.T);

    const goalTime = 2 * 3600 + 50 * 60; // M 2:50 (P5)
    const p5 = asVdot(buildPaceProfile({ ...base, goalTime }, TODAY));
    expect(p5.goal?.used).toBe(true);
    expect(p5.paces.M).toBe(Math.round(goalTime / km("m")));
    expect(formProfile.paces.M).toBeLessThan(formProfile.paces.E);
  });

  it("Marathon: Zielpace schneller als T + 1 wird auf T + 1 begrenzt (bei sehr niedrigem VDOT liegen M und T nah beieinander)", () => {
    const estimate: RecentRace = {
      distanceKm: 5,
      timeSeconds: Math.round(predictRaceSeconds(20.2, 5)),
      dateYmd: null,
      estimated: true,
    };
    const formProfile = asVdot(buildPaceProfile({ distance: "m", recentRace: estimate }, TODAY));
    const goalTime = Math.round(predictRaceSeconds(formProfile.vdot + 1.99, km("m")));
    const profile = asVdot(buildPaceProfile({ distance: "m", recentRace: estimate, goalTime }, TODAY));
    expect(profile.goal?.used).toBe(true);
    expect(profile.paces.M).toBe(profile.paces.T + CONFIG.form.goalPaceMarginSecPerKm.value);
    expect(profile.racePace.secPerKm).toBe(profile.paces.M);
    expect(profile.notes).toEqual([
      { code: "goal-pace-clamped", fromSecPerKm: Math.round(goalTime / km("m")), secPerKm: profile.paces.T + 1 },
    ]);
    expect(Math.round(goalTime / km("m"))).toBeLessThan(profile.paces.T + 1);
  });

  it("Nicht-Marathon: M bleibt die Formpace, die Zielpace steht nur in racePace", () => {
    const profile = asVdot(buildPaceProfile(hmInputs(95 * 60), TODAY));
    expect(profile.paces.M).toBe(form.paces.M);
  });

  it("5k/10k: Renntempo darf schneller als T sein", () => {
    const inputs: PaceInputs = { distance: "5k", recentRace: race(5, 20 * 60, 2), goalTime: 19 * 60 + 30 };
    const profile = asVdot(buildPaceProfile(inputs, TODAY));
    expect(profile.racePace.source).toBe("goal");
    expect(profile.racePace.secPerKm).toBeLessThan(profile.paces.T);
  });

  it("ungültige Zielzeit wird ignoriert und gemeldet", () => {
    [0, -1, Number.NaN, Number.POSITIVE_INFINITY].forEach((goalTime) => {
      const profile = asVdot(buildPaceProfile(hmInputs(goalTime), TODAY));
      expect(profile.goal).toBeNull();
      expect(profile.racePace.source).toBe("form");
      expect(profile.notes).toContainEqual({ code: "goal-invalid" });
    });
  });
});

describe("planCore pace: Referenzprofile (Abnahme)", () => {
  const between = (value: number, a: number, b: number) =>
    value >= Math.min(a, b) - TOLERANCE && value <= Math.max(a, b) + TOLERANCE;
  const byVdot = (vdot: number) => DANIELS_REFERENCE.find((row) => row.vdot === vdot);

  it("P3 (HM 1:35, 10 km in 43:30 vor 4 Wochen): T ≈ 4:20–4:30/km", () => {
    const profile = asVdot(
      buildPaceProfile({ distance: "hm", recentRace: race(10, 43 * 60 + 30, 4), goalTime: 95 * 60 }, TODAY),
    );
    expect(profile.vdot).toBeGreaterThan(46.9);
    expect(profile.vdot).toBeLessThan(47.3);
    expect(profile.paces.T).toBeGreaterThanOrEqual(4 * 60 + 20);
    expect(profile.paces.T).toBeLessThanOrEqual(4 * 60 + 30);
    expect(profile.racePace.source).toBe("goal");
  });

  it("P5 (M 2:50, HM 1:21 vor 8 Wochen): Paces liegen zwischen den Rechner-Werten von VDOT 50 und 60", () => {
    const profile = asVdot(
      buildPaceProfile(
        { distance: "m", recentRace: race(21.0975, 81 * 60, 8), goalTime: 2 * 3600 + 50 * 60 },
        TODAY,
      ),
    );
    const v50 = byVdot(50);
    const v60 = byVdot(60);
    expect(v50 && v60).toBeTruthy();
    if (!v50 || !v60 || !v50.paces.e || !v60.paces.e) return;
    expect(profile.vdot).toBeGreaterThan(50);
    expect(profile.vdot).toBeLessThan(60);
    expect(between(profile.paces.T, v50.paces.t as number, v60.paces.t as number)).toBe(true);
    expect(between(profile.paces.I, v50.paces.i as number, v60.paces.i as number)).toBe(true);
    expect(between(profile.paces.R, v50.paces.r as number, v60.paces.r as number)).toBe(true);
    expect(between(profile.paces.E, v60.paces.e.fast, v50.paces.e.slow)).toBe(true);
  });
});

describe("planCore pace: Format", () => {
  it("formatPace und formatPaceRange", () => {
    expect(formatPace(256)).toBe("4:16");
    expect(formatPace(305)).toBe("5:05");
    expect(formatPace(419.6)).toBe("7:00");
    expect(formatPaceRange(265, 293)).toBe("4:25–4:53");
  });
});

describe("planCore pace: Property-Test (I17, I18)", () => {
  const CASES = 500;

  function randomInputs(seed: number): { inputs: PaceInputs; today: Ymd } {
    const rng = createRng(seed);
    const distance = rng.pick(DISTANCES);
    const today = addDays("2026-01-01", rng.int(0, 700));
    let recentRace: RecentRace | undefined;
    if (rng.chance(0.85)) {
      const raceKm = rng.pick([5, 10, 15, 21.0975, 42.195]);
      const targetVdot = 19 + rng.next() * 68;
      const timeSeconds = Math.round(predictRaceSeconds(targetVdot, raceKm));
      const estimated = rng.chance(0.2);
      recentRace = {
        distanceKm: raceKm,
        timeSeconds,
        dateYmd: estimated ? null : addDays(today, rng.int(-3, 500) * -1),
        estimated,
      };
    }
    let goalTime: number | undefined;
    if (rng.chance(0.75)) goalTime = Math.round(predictRaceSeconds(18 + rng.next() * 75, km(distance)));
    return { inputs: { distance, recentRace, goalTime }, today };
  }

  it("I17: REC > E > M > T > I > R, alles ganze Sekunden; Beginner: REC > E", () => {
    let vdotCases = 0;
    let beginnerCases = 0;
    const violations: string[] = [];
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inputs, today } = randomInputs(seed);
      const profile = buildPaceProfile(inputs, today);
      if (profile.mode === "beginner") {
        beginnerCases += 1;
        if (!(profile.paces.REC > profile.paces.E)) violations.push(`seed ${seed}: beginner REC ≤ E`);
        continue;
      }
      vdotCases += 1;
      const { REC, E, M, T, I, R } = profile.paces;
      const ordered = [REC, E, M, T, I, R];
      if (!ordered.every((value) => Number.isInteger(value) && value > 0)) violations.push(`seed ${seed}: keine ganzen Sekunden`);
      for (let k = 1; k < ordered.length; k += 1) {
        if (!(ordered[k - 1] > ordered[k])) violations.push(`seed ${seed}: Reihenfolge ${ordered.join(">")}`);
      }
      // Renntempo nie langsamer als E.
      if (!(profile.racePace.secPerKm < E)) violations.push(`seed ${seed}: Renntempo ≥ E`);
    }
    expect(violations).toEqual([]);
    expect(vdotCases).toBeGreaterThan(CASES / 2);
    expect(beginnerCases).toBeGreaterThan(0);
  });

  it("I18: Zielpace nur bei VDOT-Lücke ≤ 2", () => {
    let goalUsed = 0;
    let goalRejected = 0;
    const violations: string[] = [];
    const gapMax = CONFIG.form.goalVdotGapMax.value;
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inputs, today } = randomInputs(seed);
      const profile = buildPaceProfile(inputs, today);
      if (profile.mode !== "vdot") continue;
      const goal = profile.goal;
      const usesGoal = profile.racePace.source === "goal";
      if (usesGoal) goalUsed += 1;
      if (!usesGoal && goal !== null) goalRejected += 1;
      if (usesGoal && (goal === null || !(goal.gapVdot <= gapMax))) violations.push(`seed ${seed}: Zielpace trotz Lücke`);
      if (!usesGoal && goal !== null && !(goal.gapVdot > gapMax)) violations.push(`seed ${seed}: Ziel abgelehnt trotz Lücke ≤ 2`);
      if ((goal?.used ?? false) !== usesGoal) violations.push(`seed ${seed}: goal.used ≠ racePace.source`);
    }
    expect(violations).toEqual([]);
    expect(goalUsed).toBeGreaterThan(20);
    expect(goalRejected).toBeGreaterThan(20);
  });

  it("deterministisch: gleiche Eingabe → gleiches Profil", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { inputs, today } = randomInputs(seed);
      expect(buildPaceProfile(inputs, today)).toEqual(buildPaceProfile(inputs, today));
    }
  });
});
