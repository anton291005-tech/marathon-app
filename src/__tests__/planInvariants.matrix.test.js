// Plan-Invarianten als Matrix: 5 km / 10 km / HM / Marathon × 6/8/12/16/20 Wochen × Finisher/Zielzeit
// × Renntag So/Di, jede Invariante in jeder Kombination, für drei Quellen:
//   deterministic — deterministischer Generator
//   chaos         — Mock-Claude mit allen Audit-Defekten
//   chaos-notaper — dasselbe, aber Claudes Struktur hat 0 Taper-Wochen
// Geprüft wird am fertigen Plan (plan.workouts / plan.weeks), unabhängig von checkPlanInvariants.

const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => jest.fn());
process.env.ANTHROPIC_API_KEY = "test-key-plan-matrix";

const Anthropic = require("@anthropic-ai/sdk");
const { COMBOS } = require("../testSupport/planMatrix");
const { deterministicPlan, claudePlan, localDate } = require("../testSupport/planSources");
const { buildVolumeContext } = require("../../api/_lib/deterministicPlanGenerator");
const { checkPlanInvariants } = require("../../api/_lib/planInvariants");
const {
  getSessionPlannedDistanceKm,
  parseStructuredWorkoutSpecFromDesc,
  computeStructuredWorkoutDistance,
} = require("../sessionDistance");

const SOURCES = ["deterministic", "chaos", "chaos-notaper"];
const plans = new Map();

const ymdOf = (w) => String(w.dateIso).slice(0, 10);
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const isHard = (w) => w.sessionType === "interval" || w.sessionType === "tempo";
const weekKm = (week) =>
  week.workouts.reduce((s, w) => s + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0), 0);

beforeAll(async () => {
  jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  Anthropic.mockImplementation(() => ({ messages: { create: mockCreate } }));
  for (const combo of COMBOS) {
    plans.set(`deterministic|${combo.id}`, deterministicPlan(combo));
    plans.set(`chaos|${combo.id}`, await claudePlan(combo, "default", mockCreate));
    plans.set(`chaos-notaper|${combo.id}`, await claudePlan(combo, "no-taper", mockCreate));
  }
}, 120000);

afterAll(() => jest.restoreAllMocks());

const cases = SOURCES.flatMap((source) => COMBOS.map((combo) => [`${source} ${combo.id}`, source, combo]));
const planOf = (source, combo) => plans.get(`${source}|${combo.id}`);

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
      const cap = week.meta?.phase === "peak" && total >= 120 ? 0.33 : 0.3;
      expect(w.km / total).toBeLessThanOrEqual(cap + 0.005);
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
  const ZONE = { easy: "Zone 2", long: "Zone 2", tempo: "Zone 3–4", interval: "Zone 4–5", race: "Zone 4–5" };
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
