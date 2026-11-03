// Randfälle von enforcePlanInvariants / distribute, ohne die Generatoren.

const { enforcePlanInvariants, distribute, checkPlanInvariants, addDays, dowOf } = require("../../api/_lib/planInvariants");
const { clampLongRunToWeekPercent } = require("../../api/_lib/planWorkoutUtils");

const START = "2026-11-02"; // Montag
const mk = (ymd, sessionType, km) => ({
  id: `t-${ymd}`,
  dateIso: `${ymd}T12:00:00.000Z`,
  sport: sessionType === "rest" ? "rest" : "run",
  sessionType,
  title: sessionType,
  km,
  desc: "x",
  pace: null,
  structured: null,
});

function baseCtx(raceYmd, extra = {}) {
  const weeks = Math.ceil((Date.parse(`${raceYmd}T00:00:00Z`) - Date.parse(`${START}T00:00:00Z`)) / (7 * 86400000)) + 1;
  return {
    startYmd: START,
    raceYmd,
    raceKm: 10,
    distKey: 10,
    weeklyKmTargets: new Array(weeks).fill(40),
    isDeload: new Array(weeks).fill(false),
    peakLongRunKm: 14,
    longRunDow: 0,
    ...extra,
  };
}

/** Jede Woche: Mo frei, Di Intervall, Mi lockerer Lauf, Do Tempo, Fr locker, Sa Tempo, So Long Run. */
function chaosWeeks(fromYmd, toYmd) {
  const out = [];
  for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) {
    const t = { 1: "rest", 2: "interval", 3: "easy", 4: "tempo", 5: "easy", 6: "tempo", 0: "long" }[dowOf(d)];
    out.push(mk(d, t, t === "rest" ? 0 : 12));
  }
  return out;
}

describe("enforcePlanInvariants", () => {
  it("Rennen am Montag: Anfahrt liegt in der Vorwoche und ist locker oder frei", () => {
    const race = "2026-11-16"; // Montag
    const out = enforcePlanInvariants(chaosWeeks(START, "2026-11-22"), baseCtx(race));
    expect(out[out.length - 1].sessionType).toBe("race");
    expect(out[out.length - 1].dateIso.slice(0, 10)).toBe(race);
    expect(["easy", "rest"]).toContain(out[out.length - 2].sessionType); // So = D-1
    expect(["easy", "rest"]).toContain(out[out.length - 3].sessionType); // Sa = D-2
    expect(out.every((w) => w.dateIso.slice(0, 10) <= race)).toBe(true);
  });

  it("Samstags-Tempo vor Sonntags-Long-Run wird verschoben oder herabgestuft", () => {
    const out = enforcePlanInvariants(chaosWeeks(START, "2026-11-29"), baseCtx("2026-11-29"));
    out.forEach((w, i) => {
      const next = out[i + 1];
      if (next && (next.sessionType === "long" || next.sessionType === "race")) {
        expect(["interval", "tempo"]).not.toContain(w.sessionType);
      }
    });
  });

  it("lückenlos: fehlende Tage werden Ruhetage, doppelte Tage verlieren die schwächere Einheit", () => {
    const sparse = [mk("2026-11-03", "interval", 10), mk("2026-11-03", "easy", 5), mk("2026-11-06", "easy", 8)];
    const out = enforcePlanInvariants(sparse, baseCtx("2026-11-08"));
    expect(out).toHaveLength(7);
    expect(out[1].sessionType === "interval" || out[1].sessionType === "easy").toBe(true);
    expect(new Set(out.map((w) => w.dateIso.slice(0, 10))).size).toBe(7);
  });

  it("Rennen aus Claude-Antwort an falschem Tag wird zu einem lockeren Lauf, das Renndatum bekommt das Rennen", () => {
    const wrong = chaosWeeks(START, "2026-11-08");
    wrong[2] = mk("2026-11-04", "race", 10);
    const out = enforcePlanInvariants(wrong, baseCtx("2026-11-08"));
    expect(out.filter((w) => w.sessionType === "race")).toHaveLength(1);
    expect(out[2].sessionType).not.toBe("race");
  });

  it("Long-Run-Überschuss landet nie auf Intervall/Tempo (Clamp, Jest)", () => {
    const week = [
      { sessionType: "long", sport: "run", km: 30 },
      { sessionType: "interval", sport: "run", km: 10 },
      { sessionType: "tempo", sport: "run", km: 10 },
      { sessionType: "easy", sport: "run", km: 10 },
      { sessionType: "rest", sport: "rest", km: 0 },
    ];
    const out = clampLongRunToWeekPercent(week, 60, 0.3);
    expect(out[0].km).toBe(18);
    expect(out[1].km).toBe(10);
    expect(out[2].km).toBe(10);
    expect(out[3].km).toBe(22); // nur der lockere Lauf nimmt die 12 km Überschuss auf
    const noEasy = clampLongRunToWeekPercent(week.filter((w) => w.sessionType !== "easy"), 50, 0.3);
    expect(noEasy[0].km).toBe(15);
    expect(noEasy[1].km).toBe(10);
    expect(noEasy[2].km).toBe(10);
  });

  it("Long-Run-Anteil in der Woche ≤ 30 %, Struktur-Einheiten behalten ihre Bausteine", () => {
    const ctx = baseCtx("2026-11-15", { weeklyKmTargets: [40, 40], peakLongRunKm: 30 });
    const out = enforcePlanInvariants([...chaosWeeks(START, "2026-11-08"), ...chaosWeeks("2026-11-09", "2026-11-15")], ctx);
    const first = out.slice(0, 7);
    const total = first.reduce((s, w) => s + w.km, 0);
    const long = first.find((w) => w.sessionType === "long");
    expect(long).toBeDefined();
    expect(long.km / total).toBeLessThanOrEqual(0.3);
    for (const w of first.filter((x) => x.sessionType === "interval" || x.sessionType === "tempo")) {
      expect(w.desc).toMatch(/km WU/);
      expect(w.desc).toMatch(/km CD/);
    }
  });

  it("Stub-Woche am Planstart bekommt keinen Long Run", () => {
    const stubStart = "2026-11-07"; // Samstag
    const ctx = { ...baseCtx("2026-11-15"), startYmd: stubStart, weeklyKmTargets: [10, 40] };
    const out = enforcePlanInvariants(chaosWeeks(stubStart, "2026-11-15"), ctx);
    const stub = out.filter((w) => w.dateIso.slice(0, 10) <= "2026-11-08");
    expect(stub.some((w) => w.sessionType === "long")).toBe(false);
  });

  it("I8: Mi Intervall + Do Tempo wird auseinandergezogen, nie neben eine harte Einheit oder vor den Long Run", () => {
    // Woche wie W4–W7 im Live-Plan: Mo locker, Di frei, Mi Intervall, Do Tempo, Fr frei, Sa locker, So Long Run
    const week = (from) =>
      ["easy", "rest", "interval", "tempo", "rest", "easy", "long"].map((t, d) => mk(addDays(from, d), t, t === "rest" ? 0 : 9));
    const race = "2026-11-24"; // Di
    const input = [...week(START), ...week("2026-11-09"), ...week("2026-11-16"), mk("2026-11-23", "easy", 5), mk(race, "race", 10)];
    const out = enforcePlanInvariants(input, baseCtx(race, { weeklyKmTargets: [40, 42, 30, 5] }));
    const isHardOrRace = (w) => ["interval", "tempo", "race"].includes(w?.sessionType);
    out.forEach((w, i) => {
      if (i > 0) expect(isHardOrRace(w) && isHardOrRace(out[i - 1])).toBe(false);
      if (["interval", "tempo"].includes(w.sessionType)) expect(["long", "race"]).not.toContain(out[i + 1]?.sessionType);
    });
    // Woche 1: beide harten Einheiten bleiben erhalten (verschoben statt gestrichen)
    expect(out.slice(0, 7).filter((w) => ["interval", "tempo"].includes(w.sessionType))).toHaveLength(2);
    expect(checkPlanInvariants(out, { ...baseCtx(race), totalWeeks: 4, taperWeeks: 1, weekDays: [7, 7, 7, 2] }).filter((p) => p.startsWith("I8"))).toEqual([]);
  });

  it("I8: Wunsch-Ruhetage (restDows) werden nie für die verschobene Einheit belegt", () => {
    const week = ["easy", "rest", "interval", "tempo", "rest", "easy", "long"].map((t, d) => mk(addDays(START, d), t, t === "rest" ? 0 : 9));
    const race = "2026-11-15";
    const next = chaosWeeks("2026-11-09", race);
    const out = enforcePlanInvariants([...week, ...next], baseCtx(race, { restDows: [2, 5], weeklyKmTargets: [40, 30] }));
    expect(out[1].sessionType).toBe("rest"); // Di
    expect(out[4].sessionType).toBe("rest"); // Fr
    expect(["interval", "tempo"].includes(out[2].sessionType) && ["interval", "tempo"].includes(out[3].sessionType)).toBe(false);
  });

  it("I8: ohne freien Platz in der Woche wird die zweite harte Einheit zu einem lockeren Lauf", () => {
    const week = ["interval", "tempo", "interval", "tempo", "interval", "rest", "long"].map((t, d) => mk(addDays(START, d), t, t === "rest" ? 0 : 9));
    const race = "2026-11-15";
    const out = enforcePlanInvariants([...week, ...chaosWeeks("2026-11-09", race)], baseCtx(race, { restDows: [6], weeklyKmTargets: [45, 30] }));
    const first = out.slice(0, 7);
    first.forEach((w, i) => {
      if (i > 0) expect(["interval", "tempo"].includes(w.sessionType) && ["interval", "tempo"].includes(first[i - 1].sessionType)).toBe(false);
    });
    expect(first.filter((w) => w.sessionType === "easy").length).toBeGreaterThanOrEqual(2);
  });

  it("I9/I10: Long Run ≥ längster lockerer Lauf und 20–30 % der Woche (war: 7,7 km bei 50 km)", () => {
    // Woche 1 wie im Live-Plan: vier lockere Läufe, Long Run am Samstag, kein Intervall
    const w1 = ["easy", "easy", "rest", "easy", "easy", "long", "rest"].map((t, d) => mk(addDays(START, d), t, t === "rest" ? 0 : 12));
    const race = "2026-11-22";
    const ctx = baseCtx(race, { weeklyKmTargets: [50, 51, 30], peakLongRunKm: 12 });
    const out = enforcePlanInvariants([...w1, ...chaosWeeks("2026-11-09", race)], ctx);
    const first = out.slice(0, 7);
    const total = first.reduce((s, w) => s + w.km, 0);
    const long = first.find((w) => w.sessionType === "long");
    expect(total).toBeCloseTo(50, 0);
    expect(long.km / total).toBeGreaterThanOrEqual(0.195);
    expect(long.km / total).toBeLessThanOrEqual(0.305);
    for (const w of first.filter((x) => x.sessionType === "easy")) expect(w.km).toBeLessThanOrEqual(long.km);
    const problems = checkPlanInvariants(out, { ...ctx, totalWeeks: 3, taperWeeks: 1, weekDays: [7, 7, 7] });
    expect(problems.filter((p) => /^I(9|10):/.test(p))).toEqual([]);
  });

  it("I9 vor Wochenumfang, I2 vor I10-Untergrenze: Long Run nach der Spitze bleibt kürzer, lockere Läufe nie darüber", () => {
    // Spitze So 15.11. (14 Tage vor dem Rennen) in einer 25-km-Woche → höchstens 7,5 km. Die Woche danach soll 50 km
    // tragen (fünf lockere Läufe + Long Run): ohne I9-Kappung lägen die lockeren Läufe bei 8,5 km über dem Long Run.
    const week = (from) => ["rest", "easy", "easy", "easy", "easy", "easy", "long"].map((t, d) => mk(addDays(from, d), t, t === "rest" ? 0 : 9));
    const race = "2026-11-29";
    const ctx = baseCtx(race, { weeklyKmTargets: [20, 25, 50, 15], peakLongRunKm: 7 });
    const out = enforcePlanInvariants([...week(START), ...week("2026-11-09"), ...week("2026-11-16"), ...week("2026-11-23")], ctx);
    const longOf = (from) => out.find((w) => w.sessionType === "long" && w.dateIso.slice(0, 10) >= from && w.dateIso.slice(0, 10) <= addDays(from, 6));
    const peak = longOf("2026-11-09");
    const after = longOf("2026-11-16");
    expect(after.km).toBeLessThan(peak.km);
    for (const w of out.filter((x) => x.dateIso.slice(0, 10) >= "2026-11-16" && x.dateIso.slice(0, 10) <= "2026-11-22" && x.sessionType === "easy")) {
      expect(w.km).toBeLessThanOrEqual(after.km);
    }
    const problems = checkPlanInvariants(out, { ...ctx, totalWeeks: 4, taperWeeks: 1, weekDays: [7, 7, 7, 7] });
    expect(problems.filter((p) => /^I(2|9|10):/.test(p))).toEqual([]);
  });

  it("I10-Obergrenze in Wochen mit drei Läufen ist 50 %: Long Run ≥ lockerer Lauf, Wochenziel erreicht", () => {
    const week = (from) => ["rest", "easy", "rest", "easy", "rest", "rest", "long"].map((t, d) => mk(addDays(from, d), t, t === "rest" ? 0 : 9));
    const race = "2026-11-29";
    const ctx = baseCtx(race, { weeklyKmTargets: [30, 31, 32, 15], peakLongRunKm: 8 });
    const out = enforcePlanInvariants([...week(START), ...week("2026-11-09"), ...week("2026-11-16"), ...week("2026-11-23")], ctx);
    const first = out.slice(0, 7);
    const long = first.find((w) => w.sessionType === "long");
    for (const w of first.filter((x) => x.sessionType === "easy")) expect(w.km).toBeLessThanOrEqual(long.km);
    expect(first.reduce((s, w) => s + w.km, 0)).toBeCloseTo(30, 0);
    const problems = checkPlanInvariants(out, { ...ctx, totalWeeks: 4, taperWeeks: 1, weekDays: [7, 7, 7, 7] });
    expect(problems.filter((p) => /^I(1|2|9|10):/.test(p))).toEqual([]);
  });

  it("7c: Entlastung ≤ 90 % der Vorwoche, volle Taper-Woche ≤ 90 % der Spitze, auch wenn das Wochenziel höher liegt", () => {
    // Jede Woche: Di Intervall, Do Tempo, Fr locker, So Long Run. Ziele so, dass Entlastung (W2) und erste
    // Taper-Woche (W5) ohne 7c auf Höhe der Spitze lägen.
    const pattern = ["rest", "interval", "rest", "tempo", "easy", "rest", "long"];
    const race = "2026-12-13"; // So, Woche 6
    const input = [];
    for (let w = 0; w < 6; w += 1) {
      pattern.forEach((t, d) => {
        const ymd = addDays(START, w * 7 + d);
        // erste Taper-Woche ohne lockeren Lauf: den Überschuss kann nur das Kürzen des Long Runs abbauen
        const type = w === 4 && t === "easy" ? "rest" : t;
        if (ymd <= race) input.push(mk(ymd, type, type === "rest" ? 0 : 10));
      });
    }
    const ctx = baseCtx(race, {
      weeklyKmTargets: [42, 42, 43, 44, 44, 20],
      isDeload: [false, true, false, false, false, false],
      weekPhaseSchedule: ["base", "base", "build", "build", "taper", "taper"].map((phase) => ({ phase })),
    });
    const out = enforcePlanInvariants(input, ctx);
    const weekKm = (w) =>
      out
        .filter((x) => x.dateIso.slice(0, 10) >= addDays(START, w * 7) && x.dateIso.slice(0, 10) <= addDays(START, w * 7 + 6))
        .reduce((s, x) => s + (x.sport !== "rest" && x.sessionType !== "race" ? x.km : 0), 0);
    const peak = Math.max(weekKm(0), weekKm(2), weekKm(3));
    expect(weekKm(1)).toBeLessThanOrEqual(0.9 * weekKm(0) + 0.05);
    expect(weekKm(4)).toBeLessThanOrEqual(0.9 * peak + 0.05);
    const problems = checkPlanInvariants(out, { ...ctx, totalWeeks: 6, taperWeeks: 2, weekDays: [7, 7, 7, 7, 7, 7] });
    expect(problems.filter((p) => /^I(1|2|9|10):/.test(p))).toEqual([]);
  });

  it("checkPlanInvariants meldet flache Pläne: Entlastung, Taper, Umfang und Long Run ohne Verlauf", () => {
    // Fünf identische Wochen (3× 10 km locker + 10 km Long Run), Woche 3 als Entlastung, Woche 5–6 Taper
    const flat = [];
    for (let w = 0; w < 5; w += 1) {
      ["easy", "rest", "easy", "rest", "easy", "rest", "long"].forEach((t, d) => flat.push(mk(addDays(START, w * 7 + d), t, t === "rest" ? 0 : 10)));
    }
    flat.push(mk("2026-12-13", "race", 10));
    const problems = checkPlanInvariants(flat, {
      ...baseCtx("2026-12-13"),
      isDeload: [false, false, true, false, false, false],
      totalWeeks: 6,
      taperWeeks: 2,
      weekDays: [7, 7, 7, 7, 7, 7],
    });
    expect(problems.some((p) => /^I1: Entlastung in Woche 3/.test(p))).toBe(true);
    expect(problems.some((p) => /^I1: Taper-Woche 5 .* kaum unter der Spitze/.test(p))).toBe(true);
    expect(problems.some((p) => /^I1: Umfang steigt nicht/.test(p))).toBe(true);
    expect(problems.some((p) => /^I2: Long Run wächst nicht/.test(p))).toBe(true);
  });

  it("checkPlanInvariants meldet I8, I9 und I10", () => {
    const week = [
      mk("2026-11-02", "easy", 14),
      mk("2026-11-03", "interval", 8),
      mk("2026-11-04", "tempo", 8),
      mk("2026-11-05", "easy", 8),
      mk("2026-11-06", "rest", 0),
      mk("2026-11-07", "easy", 8),
      mk("2026-11-08", "long", 6),
    ];
    const problems = checkPlanInvariants([...week, mk("2026-11-15", "race", 10)], {
      ...baseCtx("2026-11-15"),
      totalWeeks: 2,
      taperWeeks: 1,
      weekDays: [7, 7],
    });
    expect(problems.some((p) => p.startsWith("I8:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("I9:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("I10:"))).toBe(true);
  });

  it("ist stabil: ein zweiter Durchlauf ändert die Struktur nicht", () => {
    const ctx = baseCtx("2026-11-29");
    const once = enforcePlanInvariants(chaosWeeks(START, "2026-11-29"), ctx);
    const twice = enforcePlanInvariants(once, ctx);
    expect(twice.map((w) => w.sessionType)).toEqual(once.map((w) => w.sessionType));
    expect(checkPlanInvariants(twice, { ...ctx, totalWeeks: 4, taperWeeks: 1, weekDays: [7, 7, 7, 7] })).toEqual(
      checkPlanInvariants(once, { ...ctx, totalWeeks: 4, taperWeeks: 1, weekDays: [7, 7, 7, 7] }),
    );
  });
});

describe("distribute", () => {
  it("verteilt proportional und hält die Summe", () => {
    const out = distribute(30, [{ weight: 1, min: 3, max: 20 }, { weight: 2, min: 3, max: 20 }]);
    expect(out).toEqual([10, 20]);
  });

  it("begrenzt auf max und gibt den Rest an die übrigen", () => {
    const out = distribute(30, [{ weight: 1, min: 3, max: 6 }, { weight: 1, min: 3, max: 40 }]);
    expect(out).toEqual([6, 24]);
  });

  it("hebt auf min an, wenn die Summe zu klein ist", () => {
    const out = distribute(4, [{ weight: 1, min: 3, max: 20 }, { weight: 1, min: 3, max: 20 }]);
    expect(out).toEqual([3, 3]);
  });
});

// ── fix/plan-volume-guards ───────────────────────────────────────────────────────────────────────────────
describe("Volumen-Grenzen in enforcePlanInvariants", () => {
  const { planningCheckCtx } = (() => {
    const planningCheckCtx = (ctx, weeks) => ({
      startYmd: ctx.startYmd,
      raceYmd: ctx.raceYmd,
      raceKm: ctx.raceKm,
      distKey: ctx.distKey,
      isDeload: ctx.isDeload,
      weekDays: new Array(weeks).fill(7),
      totalWeeks: weeks,
      taperWeeks: 1,
    });
    return { planningCheckCtx };
  })();
  const ymd = (w) => w.dateIso.slice(0, 10);
  const weekOf = (w) => Math.floor((Date.parse(`${ymd(w)}T00:00:00Z`) - Date.parse(`${START}T00:00:00Z`)) / (7 * 86400000)) + 1;
  const isHard = (w) => w.sessionType === "interval" || w.sessionType === "tempo";

  /** Wie Claude in a0b9b6c1 W6–W10: der lange Lauf liegt als "easy" am Samstag, Sonntag frei. */
  function longAsEasyWeeks(fromYmd, toYmd) {
    const out = [];
    for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) {
      const dow = dowOf(d);
      if (dow === 0 || dow === 4) out.push(mk(d, "rest", 0));
      else if (dow === 6) out.push({ ...mk(d, "easy", 20), title: "Langer Lauf Ausbau" });
      else if (dow === 2) out.push(mk(d, "interval", 12));
      else if (dow === 5) out.push(mk(d, "tempo", 12));
      else out.push({ ...mk(d, "easy", 8), title: "Regenerationslauf" });
    }
    return out;
  }

  it("genau ein Long Run pro Woche: der als easy gelabelte lange Samstagslauf wird Long Run", () => {
    const race = "2026-12-27"; // So, 8 Wochen
    const ctx = baseCtx(race, { raceKm: 42.195, distKey: 42.2, weeklyKmTargets: [60, 62, 64, 66, 68, 70, 50, 70] });
    const out = enforcePlanInvariants(longAsEasyWeeks(START, race), ctx);
    for (let wn = 1; wn < 8; wn += 1) {
      const longs = out.filter((w) => weekOf(w) === wn && w.sessionType === "long");
      expect(longs).toHaveLength(1);
      expect(dowOf(ymd(longs[0]))).toBe(6);
    }
    expect(checkPlanInvariants(out, planningCheckCtx(ctx, 8)).filter((p) => p.startsWith("I12"))).toEqual([]);
  });

  it("lockere Läufe ≤ 60 % des Long Runs, auch in Wochen ohne Long Run (Rennwoche)", () => {
    const race = "2026-12-27";
    const ctx = baseCtx(race, { raceKm: 42.195, distKey: 42.2, weeklyKmTargets: [60, 62, 64, 66, 68, 70, 50, 70] });
    const out = enforcePlanInvariants(longAsEasyWeeks(START, race), ctx);
    let lastLong = 0;
    for (let wn = 1; wn <= 8; wn += 1) {
      const list = out.filter((w) => weekOf(w) === wn);
      const long = list.find((w) => w.sessionType === "long");
      const cap = 0.6 * (long ? long.km : lastLong);
      for (const w of list.filter((x) => x.sessionType === "easy")) expect(w.km).toBeLessThanOrEqual(cap + 0.05);
      if (long) lastLong = long.km;
    }
  });

  it("Rennwoche Marathon: höchstens eine harte Einheit, ≤ 8 km, nicht näher als Renntag −4; nicht aus der Vorwoche verschoben", () => {
    const race = "2026-12-27"; // So
    const input = longAsEasyWeeks(START, race).map((w) => {
      // Vorwoche: Freitags-Tempo direkt vor einem Samstags-Long-Run (wie a0b9b6c1 W15), Rennwoche: Di + Do hart
      if (ymd(w) === "2026-12-18") return mk("2026-12-18", "tempo", 18);
      if (ymd(w) === "2026-12-22") return mk("2026-12-22", "tempo", 18);
      if (ymd(w) === "2026-12-24") return mk("2026-12-24", "interval", 12);
      return w;
    });
    const ctx = baseCtx(race, { raceKm: 42.195, distKey: 42.2, weeklyKmTargets: [60, 62, 64, 66, 68, 70, 50, 70] });
    const out = enforcePlanInvariants(input, ctx);
    const raceWeekHard = out.filter((w) => weekOf(w) === 8 && isHard(w));
    expect(raceWeekHard.length).toBeLessThanOrEqual(1);
    for (const w of raceWeekHard) {
      expect(w.km).toBeLessThanOrEqual(8);
      expect((Date.parse(`${race}T00:00:00Z`) - Date.parse(`${ymd(w)}T00:00:00Z`)) / 86400000).toBeGreaterThanOrEqual(4);
    }
    // die harte Einheit vom Fr 18.12. bleibt in ihrer Woche (war: auf den Montag der Rennwoche geschoben)
    expect(out.find((w) => ymd(w) === "2026-12-21").sessionType).not.toMatch(/interval|tempo/);
    expect(checkPlanInvariants(out, planningCheckCtx(ctx, 8)).filter((p) => p.startsWith("I13"))).toEqual([]);
  });

  it("Rennwoche ohne Rennen ≤ 40 % der tatsächlichen Spitze", () => {
    const race = "2026-12-27";
    const ctx = baseCtx(race, { raceKm: 42.195, distKey: 42.2, weeklyKmTargets: [60, 62, 64, 66, 68, 70, 50, 106] });
    const out = enforcePlanInvariants(longAsEasyWeeks(START, race), ctx);
    const km = (wn) => out.filter((w) => weekOf(w) === wn && w.sport !== "rest" && w.sessionType !== "race").reduce((s, w) => s + w.km, 0);
    const peak = Math.max(...[1, 2, 3, 4, 5, 6].map(km));
    expect(km(8)).toBeLessThanOrEqual(0.4 * peak + 0.05);
  });

  it("Titel lockerer Läufe: neu aus Rolle und km, wenn der Code die km um mehr als 30 % ändert", () => {
    const race = "2026-12-27";
    const ctx = baseCtx(race, { raceKm: 42.195, distKey: 42.2, weeklyKmTargets: [60, 62, 64, 66, 68, 70, 50, 70] });
    const out = enforcePlanInvariants(longAsEasyWeeks(START, race), ctx);
    // Quelle: 8 km "Regenerationslauf"; wo der Code mehr als 30 % ändert, darf der Titel nicht bleiben
    const kept = out.filter((x) => x.sessionType === "easy" && x.title === "Regenerationslauf");
    for (const w of kept) expect(Math.abs(w.km - 8) / 8).toBeLessThanOrEqual(0.3);
    expect(out.some((x) => x.sessionType === "easy" && x.title !== "Regenerationslauf")).toBe(true);
    for (const w of out) expect(w).not.toHaveProperty("_srcKm");
  });
});

describe("weeks[].totalKm", () => {
  const { rebuildPlanFromWorkouts } = require("../../api/_lib/planWorkoutUtils");
  it("= tatsächliche Summe der Einheiten inkl. Rennen, auf 0,1 km gerundet", () => {
    const plan = rebuildPlanFromWorkouts([
      { ...mk("2026-11-02", "easy", 19.8) },
      { ...mk("2026-11-03", "interval", 14.7) },
      { ...mk("2026-11-04", "easy", 19.7) },
      { ...mk("2026-11-06", "tempo", 22.1) },
      { ...mk("2026-11-07", "easy", 19.7) },
      { ...mk("2026-11-08", "race", 42.2) },
    ]);
    expect(plan.weeks[0].totalKm).toBe(138.2);
    expect(String(plan.weeks[0].totalKm)).not.toMatch(/0000|9999/);
  });
});
