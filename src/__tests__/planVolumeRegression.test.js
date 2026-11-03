// Regression: Live-Pläne a0b9b6c1 (Marathon 2:50, 60–80 km) und cd555706 (HM 1:35, 40–60 km) vom Live-Test auf
// Production (main b0101f7, 2026-11-03). Der gespeicherte Plan (Fixture unter src/testSupport/fixtures) läuft mit dem
// Kontext der Planerzeugung (buildVolumeContext) durch enforcePlanInvariants; geprüft werden die Akzeptanzkriterien
// aus docs/roadmap.md "Plan-Volumen-Grenzen".

const { enforcePlanInvariants, checkPlanInvariants } = require("../../api/_lib/planInvariants");
const { buildVolumeContext, defaultStructureForWeeks } = require("../../api/_lib/deterministicPlanGenerator");
const { rebuildPlanFromWorkouts } = require("../../api/_lib/planWorkoutUtils");

const DAY_MS = 86400000;
const ymd = (w) => String(w.dateIso).slice(0, 10);
const isHard = (w) => w.sessionType === "interval" || w.sessionType === "tempo";
const localDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const runKm = (list) => list.reduce((s, w) => s + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0), 0);

function setup(fixture, distKeyLabel) {
  const { planStartYmd, raceYmd, raceDistanceKm } = fixture.profile;
  const rules = defaultStructureForWeeks(fixture.phases.reduce((s, p) => s + p.weeks, 0)).rules;
  const volume = buildVolumeContext({
    startDay: localDay(planStartYmd),
    raceDay: localDay(raceYmd),
    structurePhases: fixture.phases,
    raceDistanceKm,
    raceTargetTime: fixture.profile.raceTargetTime,
    raceGoal: fixture.profile.raceGoal,
    weeklyKmRange: fixture.profile.weeklyKmRange,
    longRunDow: 0,
    rules,
  });
  const enforceCtx = {
    startYmd: planStartYmd,
    raceYmd,
    raceKm: raceDistanceKm,
    raceTitle: distKeyLabel,
    distKey: volume.volumeRef.distKey,
    weeklyKmTargets: volume.weeklyKmTargets,
    isDeload: volume.isDeload,
    weekPhaseSchedule: volume.weekPhaseSchedule,
    peakLongRunKm: volume.volumeRef.peakLongRunKm,
    longRunMaxKm: volume.longRunMaxKm,
    longRunDow: 0,
    restDows: rules.restDays,
  };
  const checkCtx = {
    startYmd: planStartYmd,
    raceYmd,
    raceKm: raceDistanceKm,
    distKey: volume.volumeRef.distKey,
    isDeload: volume.isDeload,
    weekDays: volume.weekDays,
    weekPhaseSchedule: volume.weekPhaseSchedule,
    totalWeeks: volume.totalWeeks,
    taperWeeks: volume.taperWeeks,
  };
  const out = enforcePlanInvariants(fixture.workouts, enforceCtx);
  const sorted = [...out].sort((a, b) => ymd(a).localeCompare(ymd(b)));
  const weekNo = (w) => Math.floor((Date.parse(`${ymd(w)}T00:00:00Z`) - Date.parse(`${planStartYmd}T00:00:00Z`)) / (7 * DAY_MS)) + 1;
  const weeks = [];
  for (const w of sorted) (weeks[weekNo(w) - 1] ??= []).push(w);
  return { volume, checkCtx, out, sorted, weeks, raceYmd };
}

/** Prüfungen, die für beide Pläne gelten (unabhängig von checkPlanInvariants nachgerechnet). */
function commonChecks(ctx, { peakMaxKm, minGap }) {
  const { volume, checkCtx, sorted, weeks, raceYmd } = ctx;
  const peakWeek = volume.totalWeeks - volume.taperWeeks;

  it("nach enforce: 0 Verstöße gegen alle Invarianten", () => {
    expect(checkPlanInvariants(sorted, checkCtx)).toEqual([]);
  });

  it(`AK 1: Spitze ≤ ${peakMaxKm} km (Obergrenze der Umfangsangabe × 1,2)`, () => {
    expect(volume.effectivePeakKm).toBe(peakMaxKm);
    expect(Math.max(...weeks.map(runKm))).toBeLessThanOrEqual(peakMaxKm + 0.05);
  });

  it("AK 2: volle Aufbauwochen steigen höchstens 10 % über max(Vorwoche, Niveau vor Entlastung)", () => {
    let level = null;
    for (let w = 2; w <= peakWeek; w += 1) {
      if (!volume.isDeload[w - 2]) level = runKm(weeks[w - 2]);
      const ref = Math.max(runKm(weeks[w - 2]), level ?? 0);
      expect(runKm(weeks[w - 1])).toBeLessThanOrEqual(1.1 * ref + 0.3);
    }
  });

  it("AK 3: genau ein Long Run in jeder Woche außer der Rennwoche", () => {
    weeks.slice(0, -1).forEach((list) => {
      expect(list.filter((w) => w.sessionType === "long")).toHaveLength(1);
    });
    expect(weeks[weeks.length - 1].some((w) => w.sessionType === "long")).toBe(false);
  });

  it("AK 4: lockerer Lauf ≤ 60 % des Long Runs (Rennwoche: des letzten Long Runs)", () => {
    let lastLong = 0;
    weeks.forEach((list) => {
      const long = list.find((w) => w.sessionType === "long");
      const ref = long ? long.km : lastLong;
      for (const w of list.filter((x) => x.sessionType === "easy")) expect(w.km).toBeLessThanOrEqual(0.6 * ref + 0.05);
      if (long) lastLong = long.km;
    });
  });

  it(`AK 5: Rennwoche ≤ 40 % der Spitze, höchstens eine harte Einheit ≤ 8 km, frühestens Renntag −${minGap}`, () => {
    const raceWeek = weeks[weeks.length - 1];
    const peak = Math.max(...weeks.slice(0, peakWeek).map(runKm));
    expect(runKm(raceWeek)).toBeLessThanOrEqual(0.4 * peak + 0.05);
    const hard = raceWeek.filter(isHard);
    expect(hard.length).toBeLessThanOrEqual(1);
    for (const w of hard) {
      expect(w.km).toBeLessThanOrEqual(8);
      expect((Date.parse(`${raceYmd}T00:00:00Z`) - Date.parse(`${ymd(w)}T00:00:00Z`)) / DAY_MS).toBeGreaterThanOrEqual(minGap);
    }
  });

  it("AK 7: weeks[].totalKm = tatsächliche Summe (Rennwoche inkl. Rennen), auf 0,1 km gerundet", () => {
    const plan = rebuildPlanFromWorkouts(sorted);
    for (const week of plan.weeks) {
      const sum = week.workouts.reduce((s, w) => s + (w.sport !== "rest" ? w.km : 0), 0);
      expect(week.totalKm).toBeCloseTo(sum, 5);
      expect(Math.round(week.totalKm * 10) / 10).toBe(week.totalKm);
    }
  });

  it("AK 7: Titel lockerer Läufe aus Rolle/km, wenn der Code die km um mehr als 30 % ändert", () => {
    // Zuordnung über die ID: Tagesvertauschungen (Schritt 4/4b) verschieben das Datum, nicht die ID
    const sources = new Map(ctx.fixture.workouts.map((w) => [w.id, w]));
    const generated = ["Lockerer Dauerlauf", "Kurzer lockerer Lauf", "Lockerer Lauf vor dem Rennen", "Regenerationslauf"];
    let changed = 0;
    for (const w of sorted.filter((x) => x.sessionType === "easy")) {
      const src = sources.get(w.id);
      if (!src || src.sessionType !== "easy" || !(src.km > 0) || Math.abs(w.km - src.km) / src.km <= 0.3) continue;
      changed += 1;
      expect(generated).toContain(w.title);
    }
    expect(changed).toBeGreaterThan(0);
  });
}

describe("Live-Plan a0b9b6c1: Marathon 2:50, 16 Wochen, 60–80 km", () => {
  const fixture = require("../testSupport/fixtures/livePlanMarathon-2027-02-28.json");
  const ctx = { fixture, ...setup(fixture, "Marathon") };

  it("die Fixture zeigt die gemeldeten Defekte (sonst prüft der Test nichts)", () => {
    const problems = checkPlanInvariants(fixture.workouts, ctx.checkCtx);
    const codes = new Set(problems.map((p) => p.split(":")[0]));
    for (const code of ["I9", "I11", "I12", "I13"]) expect(codes.has(code)).toBe(true);
    // Spitze 150 km, W6–W10 ohne Long Run, Rennwoche-Montag Tempo 19,6 km
    const byDay = new Map(fixture.workouts.map((w) => [ymd(w), w]));
    expect(byDay.get("2027-02-22").sessionType).toBe("tempo");
    expect(byDay.get("2027-02-22").km).toBe(19.6);
    expect(problems.filter((p) => p.startsWith("I12")).length).toBeGreaterThanOrEqual(5);
  });

  commonChecks(ctx, { peakMaxKm: 96, minGap: 4 });

  it("W6–W10 haben wieder einen Long Run, lockere Läufe nicht mehr bis 31 km", () => {
    for (let w = 6; w <= 10; w += 1) expect(ctx.weeks[w - 1].some((x) => x.sessionType === "long")).toBe(true);
    expect(Math.max(...ctx.sorted.filter((x) => x.sessionType === "easy").map((x) => x.km))).toBeLessThan(20);
  });

  it("Montag der Rennwoche (Renntag −6): harte Einheit höchstens 8 km statt 19,6 km", () => {
    const monday = ctx.sorted.find((w) => ymd(w) === "2027-02-22");
    if (isHard(monday)) expect(monday.km).toBeLessThanOrEqual(8);
    expect(ctx.sorted.filter((w) => ymd(w) >= "2027-02-22" && isHard(w)).length).toBeLessThanOrEqual(1);
  });
});

describe("Live-Plan cd555706: Halbmarathon 1:35, 12 Wochen, 40–60 km", () => {
  const fixture = require("../testSupport/fixtures/livePlanHalf-2027-01-31.json");
  const ctx = { fixture, ...setup(fixture, "Halbmarathon") };

  it("die Fixture zeigt die gemeldeten Defekte (sonst prüft der Test nichts)", () => {
    const codes = new Set(checkPlanInvariants(fixture.workouts, ctx.checkCtx).map((p) => p.split(":")[0]));
    expect(codes.has("I11")).toBe(true);
    const weekly = [];
    for (const w of fixture.workouts) {
      const wn = Math.floor((Date.parse(`${ymd(w)}T00:00:00Z`) - Date.parse("2026-11-09T00:00:00Z")) / (7 * DAY_MS));
      weekly[wn] = (weekly[wn] ?? 0) + (w.sport !== "rest" && w.sessionType !== "race" ? w.km : 0);
    }
    expect(Math.round(weekly[4])).toBe(65); // W5 nach 43 km in W4
    expect(Math.round(weekly[9])).toBe(85); // Spitze
  });

  commonChecks(ctx, { peakMaxKm: 72, minGap: 3 });

  it("kein Sprung um +45–51 % mehr nach den Entlastungswochen (W4→W5, W8→W9)", () => {
    const km = ctx.weeks.map(runKm);
    expect(km[4]).toBeLessThanOrEqual(1.1 * Math.max(km[3], km[2]) + 0.3);
    expect(km[8]).toBeLessThanOrEqual(1.1 * Math.max(km[7], km[6]) + 0.3);
  });
});
