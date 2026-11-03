// Plan-Invarianten als Matrix: 5 km / 10 km / HM / Marathon × 6/8/12/16/20 Wochen × Finisher/Zielzeit
// × Renntag Mo–So, jede Invariante in jeder Kombination, für drei Quellen:
//   deterministic — deterministischer Generator
//   chaos         — Mock-Claude mit allen Audit-Defekten
//   chaos-notaper — dasselbe, aber Claudes Struktur hat 0 Taper-Wochen
//   fallback      — jeder Phasen-Aufruf schlägt fehl → deterministischer Fallback im Claude-Pfad
//   fallback-partial — nur der erste Phasen-Aufruf schlägt fehl (Chunk-Fallback gemischt mit Chaos)
//   chaos-3runs   — Mock-Claude mit drei Läufen pro Woche (Long Run + Intervall + locker / + 2× locker), vier Ruhetage
// Zusätzlich PARTIAL_COMBOS: Planstart mitten in der ersten Woche (Teilwoche), 8 und 12 Wochen, Start Di…So, Rennen So/Di.
// Geprüft wird am fertigen Plan (plan.workouts / plan.weeks), unabhängig von checkPlanInvariants.
// Invarianten: I1 Umfang (inkl. kein flacher Plan) · I2 Long-Run-Verlauf · I3 Rennende · I4 Vortag · I5 Bausteine · I6 Zonen · I7 Phasenname
// · I8 keine zwei harten Tage hintereinander · I9 Long Run ≥ lockerer Lauf · I10 Long Run 20–30 % der Woche.

const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => jest.fn());
process.env.ANTHROPIC_API_KEY = "test-key-plan-matrix";

const Anthropic = require("@anthropic-ai/sdk");
const { COMBOS, PARTIAL_COMBOS } = require("../testSupport/planMatrix");
const { deterministicPlan, claudePlan, claudeRun, localDate } = require("../testSupport/planSources");
const { buildVolumeContext } = require("../../api/_lib/deterministicPlanGenerator");
const { checkPlanInvariants } = require("../../api/_lib/planInvariants");
const {
  getSessionPlannedDistanceKm,
  parseStructuredWorkoutSpecFromDesc,
  computeStructuredWorkoutDistance,
} = require("../sessionDistance");

const SOURCES = ["deterministic", "chaos", "chaos-notaper", "fallback", "fallback-partial", "chaos-3runs"];
const VARIANT = { chaos: "default", "chaos-notaper": "no-taper", "chaos-3runs": "three-runs" };
const ALL_COMBOS = [...COMBOS, ...PARTIAL_COMBOS];
const plans = new Map();

const ymdOf = (w) => String(w.dateIso).slice(0, 10);
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const isHard = (w) => w.sessionType === "interval" || w.sessionType === "tempo";
const weekKm = (week) =>
  week.workouts.reduce((s, w) => s + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0), 0);
const RUN_TYPES = ["easy", "long", "interval", "tempo"];
/**
 * Obergrenze des Long-Run-Anteils: 30 % (33 % in Peak-Wochen ab 120 km), bei ≤ 3 Läufen 50 %. Vorrang I9: mit
 * lockeren Läufen ≤ 60 % und harten ≤ 115 % des Long Runs muss der Long Run mindestens 1 / (1 + 0,6·e + 1,15·h)
 * der Woche tragen — so hoch steigt die Grenze, wenn das darüber liegt (wenige, lockere Läufe).
 */
const longRunCapOf = (week, total) => {
  const runs = week.workouts.filter((x) => RUN_TYPES.includes(x.sessionType) && x.sport !== "rest").length;
  const easy = week.workouts.filter((x) => x.sessionType === "easy" && x.sport !== "rest").length;
  const hard = week.workouts.filter((x) => x.sessionType === "interval" || x.sessionType === "tempo").length;
  const share = week.meta?.phase === "peak" && total >= 120 ? 0.33 : 0.3;
  const base = runs <= 3 ? Math.max(share, 0.5) : share;
  return runs === 1 ? 1 : Math.max(base, easy + hard > 0 ? 1 / (1 + 0.6 * easy + 1.15 * hard) : 0);
};

beforeAll(async () => {
  jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  for (const combo of ALL_COMBOS) {
    plans.set(`deterministic|${combo.id}`, deterministicPlan(combo));
    for (const source of SOURCES.slice(1)) {
      plans.set(`${source}|${combo.id}`, await claudePlan(combo, VARIANT[source] ?? source, mockCreate));
    }
  }
}, 600000);

afterAll(() => jest.restoreAllMocks());

const cases = SOURCES.flatMap((source) => ALL_COMBOS.map((combo) => [`${source} ${combo.id}`, source, combo]));
const planOf = (source, combo) => plans.get(`${source}|${combo.id}`);

describe("Fallback-Quellen nehmen wirklich den Fallback-Pfad", () => {
  const combo = COMBOS.find((c) => c.id === "10k-8w-finish-Di");

  it("fallback: alle Phasen laufen über den deterministischen Fallback", async () => {
    const { diagnostics } = await claudeRun(combo, "fallback", mockCreate);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.status === "fallback")).toBe(true);
  });

  it("fallback-partial: die erste Phase fällt zurück, die übrigen kommen von Claude", async () => {
    const { diagnostics } = await claudeRun(combo, "fallback-partial", mockCreate);
    expect(diagnostics[0].status).toBe("fallback");
    expect(diagnostics.slice(1).every((d) => d.status === "claude")).toBe(true);
  });
});

describe("Plan-Grundlage", () => {
  it.each(cases)("%s: Plan hat Wochen und endet mit dem Rennen", (_n, source, combo) => {
    const plan = planOf(source, combo);
    expect(plan.weeks.length).toBe(combo.weeks);
    const dates = plan.workouts.map(ymdOf).sort();
    expect(dates[0]).toBe(combo.startYmd);
    expect(dates[dates.length - 1]).toBe(combo.raceYmd);
  });
});

describe("I1 Wochenumfang steigt bis zur Spitze, danach Taper", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const taper = plan.weeks.filter((w) => w.meta?.phase === "taper");
    const build = plan.weeks.filter((w) => w.meta?.phase !== "taper");
    expect(taper.length).toBeGreaterThanOrEqual(1);
    expect(taper.length).toBeLessThanOrEqual(3);
    const fullTaper = taper.filter((w) => w.workouts.length >= 4);
    expect(fullTaper.length).toBeGreaterThanOrEqual(1);
    expect(fullTaper.length).toBeLessThanOrEqual(2);
    // Taper liegt am Ende, am Stück
    expect(plan.weeks.slice(-taper.length).every((w) => w.meta?.phase === "taper")).toBe(true);

    let previous = null;
    for (const week of build) {
      if (week.meta?.isRecoveryWeek || week.workouts.length < 7) continue;
      const km = weekKm(week);
      if (previous != null) expect(km).toBeGreaterThanOrEqual(previous * 0.97 - 0.5);
      previous = km;
    }
    // Entlastung nie in den letzten beiden Aufbau-Wochen, höchstens jede 4. Woche
    const lastTwo = build.slice(-2);
    expect(lastTwo.some((w) => w.meta?.isRecoveryWeek)).toBe(false);
    const deloadNumbers = plan.weeks.map((w, i) => (w.meta?.isRecoveryWeek ? i + 1 : null)).filter(Boolean);
    deloadNumbers.forEach((n, i) => {
      if (i > 0) expect(n - deloadNumbers[i - 1]).toBeGreaterThanOrEqual(4);
    });
    // Taper fällt (Rennen nicht mitgezählt) und liegt unter der Spitze
    const peakKm = Math.max(...build.map(weekKm));
    let before = weekKm(build[build.length - 1]);
    for (const week of taper) {
      const km = weekKm(week);
      expect(km).toBeLessThanOrEqual(before + 0.05);
      expect(km).toBeLessThan(peakKm);
      before = km;
    }
  });
});

describe("I1/I2 kein flacher Plan: Entlastung und Taper spürbar tiefer, Umfang und Long Run wachsen", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const build = plan.weeks.filter((w) => w.meta?.phase !== "taper");
    const peakKm = Math.max(...build.map(weekKm));
    plan.weeks.forEach((week, i) => {
      if (week.meta?.isRecoveryWeek && i > 0) expect(weekKm(week)).toBeLessThanOrEqual(0.9 * weekKm(plan.weeks[i - 1]) + 0.05);
      if (week.meta?.phase === "taper" && week.workouts.length >= 7) expect(weekKm(week)).toBeLessThanOrEqual(0.9 * peakKm + 0.05);
    });
    const first = build.find((w) => w.workouts.length >= 7 && !w.meta?.isRecoveryWeek);
    expect(peakKm).toBeGreaterThanOrEqual(1.03 * weekKm(first) - 0.05);
    const longs = plan.workouts.filter((w) => w.sessionType === "long").sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    expect(Math.max(...longs.map((w) => w.km))).toBeGreaterThanOrEqual(1.05 * longs[0].km - 0.05);
  });
});

describe("I2 Long Run wächst bis 2–3 Wochen vor dem Rennen", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const longs = plan.workouts.filter((w) => w.sessionType === "long").sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    expect(longs.length).toBeGreaterThanOrEqual(2);
    const perWeek = new Map();
    plan.weeks.forEach((week, i) => perWeek.set(i, week.workouts.filter((w) => w.sessionType === "long").length));
    for (const n of perWeek.values()) expect(n).toBeLessThanOrEqual(1);

    const maxKm = Math.max(...longs.map((w) => w.km));
    const peak = longs.filter((w) => w.km === maxKm).pop();
    const minDays = combo.distance.km <= 15 ? 14 : 21;
    const gap = daysBetween(combo.raceYmd, ymdOf(peak));
    expect(gap).toBeGreaterThanOrEqual(minDays);
    expect(gap).toBeLessThanOrEqual(minDays + 6);

    const weekOf = (w) => plan.weeks.find((week) => week.workouts.some((x) => x.id === w.id && ymdOf(x) === ymdOf(w)));
    let prev = null;
    for (const w of longs) {
      if (daysBetween(ymdOf(w), ymdOf(peak)) > 0) break;
      const week = weekOf(w);
      if (week.meta?.isRecoveryWeek || week.workouts.length < 7) continue;
      if (prev != null) expect(w.km).toBeGreaterThanOrEqual(prev - 0.15);
      prev = w.km;
    }
    let after = peak.km;
    for (const w of longs.filter((x) => daysBetween(ymdOf(x), ymdOf(peak)) > 0)) {
      expect(w.km).toBeLessThanOrEqual(after + 0.15);
      after = w.km;
    }
    // Anteil am Wochenvolumen (Rennen zählt mit), Wochen mit mindestens zwei Läufen
    for (const w of longs) {
      const week = weekOf(w);
      const total = week.workouts.reduce((s, x) => s + (x.sport !== "rest" ? x.km : 0), 0);
      const runs = week.workouts.filter((x) => ["easy", "long", "interval", "tempo"].includes(x.sessionType)).length;
      if (runs < 2) continue;
      expect(w.km / total).toBeLessThanOrEqual(longRunCapOf(week, total) + 0.005);
    }
  });
});

describe("I3 Rennen ist die letzte Einheit, die 2 Tage davor locker oder frei", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const sorted = [...plan.workouts].sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    const races = sorted.filter((w) => w.sessionType === "race");
    expect(races).toHaveLength(1);
    expect(sorted[sorted.length - 1]).toBe(races[0]);
    expect(ymdOf(races[0])).toBe(combo.raceYmd);
    expect(races[0].km).toBeCloseTo(Math.round(combo.distance.km * 10) / 10, 1);
    expect(sorted.every((w) => ymdOf(w) <= combo.raceYmd)).toBe(true);
    for (const [k, cap] of [[1, 6], [2, 10]]) {
      const w = sorted[sorted.length - 1 - k];
      expect(["easy", "rest"]).toContain(w.sessionType);
      expect(w.km).toBeLessThanOrEqual(cap);
    }
    // Kein "Taper"/Training nach dem Rennen: keine Woche beginnt nach dem Renntag
    expect(plan.weeks.every((week) => week.startIso <= combo.raceYmd)).toBe(true);
  });
});

describe("I4 keine harte Einheit am Vortag von Long Run oder Rennen", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const sorted = [...plan.workouts].sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    sorted.forEach((w, i) => {
      const next = sorted[i + 1];
      if (isHard(w) && next && daysBetween(ymdOf(next), ymdOf(w)) === 1) {
        expect(["long", "race"]).not.toContain(next.sessionType);
      }
    });
  });
});

describe("I5 km einer Einheit = Summe ihrer Bausteine (±10 %), Text nennt dieselben km", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const hard = plan.workouts.filter(isHard);
    expect(hard.length).toBeGreaterThan(0);
    for (const w of hard) {
      // Quelle 1: Beschreibung, gelesen vom Client-Parser
      const parsed = parseStructuredWorkoutSpecFromDesc(w.desc);
      expect(parsed).not.toBeNull();
      const fromText = computeStructuredWorkoutDistance(parsed.workout);
      expect(Math.abs(fromText - w.km)).toBeLessThanOrEqual(0.1 * w.km);
      // Quelle 2: die Distanz, die der Client tatsächlich für die Einheit verwendet
      const resolved = getSessionPlannedDistanceKm({ km: w.km, type: w.sessionType, desc: w.desc, structured: w.structured });
      expect(Math.abs(resolved - w.km)).toBeLessThanOrEqual(0.1 * w.km);
      expect(Math.abs(resolved - w.km)).toBeLessThanOrEqual(0.2);
    }
    for (const w of plan.workouts.filter((x) => x.sessionType === "easy" || x.sessionType === "long")) {
      for (const m of String(w.desc).matchAll(/(\d+(?:,\d+)?)\s*km/g)) {
        expect(Number(m[1].replace(",", "."))).toBeCloseTo(w.km, 1);
      }
    }
  });
});

describe("I6 eine Zonensprache: kein GA/HFmax/bpm im Text, Zone im Text = Zone der Einheit", () => {
  const ZONE = { easy: "Zone 2", long: "Zone 2", bike: "Zone 2", tempo: "Zone 3–4", interval: "Zone 4–5", race: "Zone 4–5" };
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    plan.weeks.forEach((week) => {
      for (const w of week.workouts) {
        const text = `${w.title} ${w.desc}`;
        expect(text).not.toMatch(/GA\s?[12]|HF\s?max|bpm|%|Puls|Herzfrequenz/i);
        const expected = w.sessionType === "easy" && week.meta?.isRecoveryWeek ? "Zone 1" : ZONE[w.sessionType];
        for (const z of text.match(/Zone \d(?:–\d)?/g) ?? []) expect(z).toBe(expected);
      }
    });
  });
});

describe("I7 ein Phasenname pro Woche, überall gleich", () => {
  const NAMES = { base: "Grundlage", build: "Aufbau", peak: "Spitze", taper: "Taper" };
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    plan.weeks.forEach((week, i) => {
      const { phase, label, isRecoveryWeek, focus } = week.meta;
      expect(label).toBe(`Woche ${i + 1} · ${NAMES[phase]}`);
      for (const [other, name] of Object.entries(NAMES)) {
        if (other !== phase && name !== NAMES[phase]) expect(label).not.toContain(name);
      }
      expect(label).not.toMatch(/Entwicklungsphase|Tapering|Base|Build|Peak|⬇/);
      if (isRecoveryWeek) expect(String(focus).toLowerCase()).toContain("entlastung");
    });
    // Nach dem Rennen gibt es keine Phase mehr: die letzte Woche endet am Renntag
    expect(plan.weeks[plan.weeks.length - 1].workouts.every((w) => ymdOf(w) <= combo.raceYmd)).toBe(true);
  });
});

describe("I8 keine zwei harten Einheiten (Intervall, Tempo, Rennen) an aufeinanderfolgenden Tagen", () => {
  const hardOrRace = (w) => isHard(w) || w.sessionType === "race";
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const sorted = [...plan.workouts].sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    sorted.forEach((w, i) => {
      const next = sorted[i + 1];
      if (next && daysBetween(ymdOf(next), ymdOf(w)) === 1) expect(hardOrRace(w) && hardOrRace(next)).toBe(false);
    });
  });
});

describe("I9 Long Run ≥ längster lockerer Lauf derselben Woche", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    for (const week of plan.weeks) {
      const long = week.workouts.find((w) => w.sessionType === "long");
      if (!long) continue;
      for (const w of week.workouts.filter((x) => x.sessionType === "easy")) expect(w.km).toBeLessThanOrEqual(long.km + 0.05);
    }
  });
});

describe("I10 Long Run 20–30 % des Wochenumfangs (volle Wochen, Rennwoche ausgenommen)", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const longs = plan.workouts.filter((w) => w.sessionType === "long").sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)));
    const peakKm = Math.max(...longs.map((w) => w.km));
    const peak = longs.filter((w) => w.km === peakKm).pop();
    const weekOf = (w) => plan.weeks.find((week) => week.workouts.some((x) => x.id === w.id && ymdOf(x) === ymdOf(w)));
    const inChain = (w) => !weekOf(w).meta?.isRecoveryWeek && weekOf(w).workouts.length >= 7;
    let previous = null;
    for (const long of longs) {
      const week = weekOf(long);
      const afterPeak = daysBetween(ymdOf(long), ymdOf(peak)) > 0;
      // I2 hat Vorrang vor der Untergrenze: vor der Spitze höchstens so lang wie der kürzeste spätere Long Run der
      // Kette, danach knapp unter dem Long Run davor
      const later = longs.filter((x) => x !== long && (x === peak || (ymdOf(x) > ymdOf(long) && ymdOf(x) < ymdOf(peak) && inChain(x))));
      const i2Bound = afterPeak ? (previous?.km ?? peakKm) - 0.1 : Math.min(...later.map((x) => x.km));
      if (afterPeak) previous = long;
      if (week === plan.weeks[plan.weeks.length - 1] || week.workouts.length < 7) continue;
      const total = weekKm(week);
      const runs = week.workouts.filter((x) => RUN_TYPES.includes(x.sessionType)).length;
      if (runs < 2) continue;
      expect(long.km).toBeGreaterThanOrEqual(Math.min(0.2 * total, i2Bound) - 0.005 * total);
      expect(long.km / total).toBeLessThanOrEqual(longRunCapOf(week, total) + 0.005);
    }
    // Ohne Long Run bleibt nur eine volle Woche, deren Sonntag (Long-Run-Tag) in der Anfahrt liegt (Renntag −2/−1)
    const approach = new Set([1, 2].map((k) => new Date(Date.parse(`${combo.raceYmd}T00:00:00Z`) - k * DAY_MS).toISOString().slice(0, 10)));
    for (const week of plan.weeks.slice(0, -1)) {
      if (week.workouts.length < 7 || week.workouts.some((x) => x.sessionType === "long")) continue;
      expect(week.workouts.some((x) => approach.has(ymdOf(x)) && new Date(`${ymdOf(x)}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
    }
  });
});

describe("Selbstprüfung des Generators (checkPlanInvariants) meldet nichts", () => {
  it.each(cases)("%s", (_n, source, combo) => {
    const plan = planOf(source, combo);
    const volume = buildVolumeContext({
      startDay: localDate(combo.startYmd),
      raceDay: localDate(combo.raceYmd),
      structurePhases: undefined,
      raceDistanceKm: combo.profile.raceDistanceKm,
      raceTargetTime: combo.profile.raceTargetTime,
      raceGoal: combo.goal,
      weeklyKmRange: combo.profile.weeklyKmRange,
    });
    const problems = checkPlanInvariants(plan.workouts, {
      startYmd: combo.startYmd,
      raceYmd: combo.raceYmd,
      raceKm: Math.round(combo.profile.raceDistanceKm * 10) / 10,
      distKey: volume.volumeRef.distKey,
      isDeload: plan.weeks.map((w) => w.meta?.isRecoveryWeek === true),
      weekDays: volume.weekDays,
      weekPhaseSchedule: plan.weeks.map((w) => ({ phase: w.meta?.phase })),
      totalWeeks: plan.weeks.length,
      taperWeeks: plan.weeks.filter((w) => w.meta?.phase === "taper").length,
    });
    expect(problems).toEqual([]);
  });
});
