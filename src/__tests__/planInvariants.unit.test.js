// Randfälle von enforcePlanInvariants / distribute, ohne die Generatoren.

const { enforcePlanInvariants, distribute, checkPlanInvariants, addDays, dowOf } = require("../../api/_lib/planInvariants");

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

  it("Long-Run-Überschuss landet nie auf Intervall/Tempo", () => {
    const week = chaosWeeks(START, "2026-11-08");
    const ctx = baseCtx("2026-11-15", { weeklyKmTargets: [40, 40], peakLongRunKm: 30 });
    const out = enforcePlanInvariants([...week, ...chaosWeeks("2026-11-09", "2026-11-15")], ctx);
    const first = out.slice(0, 7);
    const total = first.reduce((s, w) => s + w.km, 0);
    const long = first.find((w) => w.sessionType === "long");
    if (long) expect(long.km / total).toBeLessThanOrEqual(0.3 + 0.005);
    for (const w of first.filter((x) => x.sessionType === "interval" || x.sessionType === "tempo")) {
      expect(w.km).toBeLessThanOrEqual(14);
    }
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
