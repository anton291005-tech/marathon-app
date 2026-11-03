// Wochenvolumen, Entlastung und Taper: Invarianten I1 auf Ziel-Ebene über die ganze Matrix
// (Distanz × Planlänge × Finisher/Zielzeit × Renntag So/Di).

const { COMBOS } = require("../testSupport/planMatrix");
const {
  computeVolumePlan,
  resolveTaperWeeks,
  resolvePeakKm,
  applyTaperToSchedule,
  countTrailingTaperWeeks,
  DELOAD_FACTOR,
} = require("../../api/_lib/weeklyVolumeProgression");
const {
  buildWeekPhaseSchedule,
  computeWeekStartDates,
  computeWeekDayCounts,
  defaultStructureForWeeks,
  parseOnboardingRaceDate,
  parseWeeklyKmTarget,
} = require("../../api/_lib/deterministicPlanGenerator");
const { getRecommendedVolume } = require("../../api/_lib/raceVolumeReference");

function volumePlanFor(combo) {
  const { profile } = combo;
  const start = parseOnboardingRaceDate(profile.planStartDate);
  const race = parseOnboardingRaceDate(profile.raceDate);
  const { totalWeeks } = computeWeekStartDates(start, race);
  const weekDays = computeWeekDayCounts(start, race);
  const volumeRef = getRecommendedVolume(profile.raceDistanceKm, profile.raceTargetTime, profile.raceGoal);
  const taperWeeks = resolveTaperWeeks({
    distKey: volumeRef.distKey,
    totalWeeks,
    raceWeekDays: weekDays[totalWeeks - 1],
  });
  const schedule = applyTaperToSchedule(
    buildWeekPhaseSchedule(totalWeeks, defaultStructureForWeeks(totalWeeks).phases),
    taperWeeks,
  );
  const startKm = parseWeeklyKmTarget(profile.weeklyKmRange);
  const peakKm = resolvePeakKm({ referencePeakKm: volumeRef.peakKm[1], startWeeklyKm: startKm });
  const plan = computeVolumePlan({
    totalWeeks,
    phaseSchedule: schedule,
    startWeeklyKm: startKm,
    peakTargetKm: peakKm,
    weekDays,
    raceKm: profile.raceDistanceKm,
  });
  return { totalWeeks, weekDays, schedule, taperWeeks, startKm, peakKm, volumeRef, ...plan };
}

const cases = COMBOS.map((combo) => [combo.id, combo, volumePlanFor(combo)]);

describe("I1 Wochenumfang: Aufbau bis zur Spitze, danach Taper", () => {
  it.each(cases)("%s: Planlänge stimmt mit der Matrix überein", (_id, combo, vp) => {
    expect(vp.totalWeeks).toBe(combo.weeks);
    expect(vp.targets).toHaveLength(combo.weeks);
  });

  it.each(cases)("%s: Wochen ohne Entlastung steigen bis zur Spitze", (_id, _combo, vp) => {
    const peakWeek = vp.totalWeeks - vp.taperWeeks;
    let previous = null;
    for (let w = 1; w <= peakWeek; w += 1) {
      if (vp.isDeload[w - 1] || vp.weekDays[w - 1] < 7) continue;
      if (previous != null) expect(vp.targets[w - 1]).toBeGreaterThanOrEqual(previous);
      previous = vp.targets[w - 1];
    }
  });

  it.each(cases)("%s: Peak-Woche hat das Maximum und liegt über dem Start (≥ +10 %)", (_id, _combo, vp) => {
    const peakWeek = vp.totalWeeks - vp.taperWeeks;
    const buildTargets = vp.targets.slice(0, peakWeek);
    expect(vp.targets[peakWeek - 1]).toBe(Math.max(...buildTargets));
    expect(vp.targets[peakWeek - 1]).toBeGreaterThanOrEqual(Math.round(vp.startKm * 1.1));
    expect(vp.peakKm).toBeGreaterThanOrEqual(Math.round(vp.volumeRef.peakKm[1]));
  });

  it.each(cases)("%s: Entlastung höchstens jede 4. Woche, nie in Peak, Woche davor oder Taper", (_id, _combo, vp) => {
    const peakWeek = vp.totalWeeks - vp.taperWeeks;
    const deloads = vp.isDeload.map((d, i) => (d ? i + 1 : null)).filter((w) => w != null);
    deloads.forEach((w, i) => {
      expect(w).toBeLessThanOrEqual(peakWeek - 2);
      if (i > 0) expect(w - deloads[i - 1]).toBeGreaterThanOrEqual(4);
      const trendNeighbour = vp.targets[w - 2];
      expect(vp.targets[w - 1]).toBeLessThan(trendNeighbour);
      expect(vp.targets[w - 1] / vp.targets[w]).toBeLessThanOrEqual(1);
    });
    for (let w = peakWeek + 1; w <= vp.totalWeeks; w += 1) expect(vp.isDeload[w - 1]).toBe(false);
    expect(DELOAD_FACTOR).toBeLessThan(1);
  });

  it.each(cases)("%s: Taper fällt (Rennen nicht mitgezählt), 1–2 volle Taper-Wochen", (_id, combo, vp) => {
    const peakWeek = vp.totalWeeks - vp.taperWeeks;
    expect(countTrailingTaperWeeks(vp.schedule)).toBe(vp.taperWeeks);
    const taperKm = vp.targets.slice(peakWeek).map((km, i, arr) => (i === arr.length - 1 ? km - combo.profile.raceDistanceKm : km));
    for (let i = 0; i < taperKm.length; i += 1) {
      const previous = i === 0 ? vp.targets[peakWeek - 1] : taperKm[i - 1];
      expect(taperKm[i]).toBeLessThan(previous);
    }
    const fullTaperWeeks = vp.schedule.filter((e, i) => e.phase === "taper" && vp.weekDays[i] >= 4).length;
    expect(fullTaperWeeks).toBeGreaterThanOrEqual(1);
    expect(fullTaperWeeks).toBeLessThanOrEqual(2);
    expect(vp.weekDays[vp.totalWeeks - 1] < 4 ? vp.taperWeeks - 1 : vp.taperWeeks).toBe(fullTaperWeeks);
  });

  it.each(cases)("%s: Rennwoche anteilig bis zum Renntag", (_id, combo, vp) => {
    const last = vp.targets[vp.totalWeeks - 1];
    const raceKm = combo.profile.raceDistanceKm;
    expect(last).toBeGreaterThanOrEqual(Math.round(raceKm));
    // Höchstens Rennen + Volumen der Tage davor (6/7 des Spitzenumfangs bei voller Woche)
    expect(last).toBeLessThanOrEqual(Math.round(raceKm + (vp.peakKm * (vp.weekDays[vp.totalWeeks - 1] - 1)) / 7) + 1);
    // Rennwoche Mo bis Renntag: Mo = 1 Tag … Sa = 6 Tage, So = volle Woche
    expect(vp.weekDays[vp.totalWeeks - 1]).toBe(combo.raceDow === 0 ? 7 : combo.raceDow);
  });
});

describe("Randfälle", () => {
  it("Finisher: Referenz-Peak unter Startumfang wird auf Start + 10 % angehoben", () => {
    expect(resolvePeakKm({ referencePeakKm: 40, startWeeklyKm: 50 })).toBe(55);
    expect(resolvePeakKm({ referencePeakKm: 90, startWeeklyKm: 50 })).toBe(90);
  });

  it("Planstart mitten in der Woche: erste Woche anteilig, Rest unverändert", () => {
    const schedule = applyTaperToSchedule(
      buildWeekPhaseSchedule(8, defaultStructureForWeeks(8).phases),
      1,
    );
    const full = computeVolumePlan({ totalWeeks: 8, phaseSchedule: schedule, startWeeklyKm: 40, peakTargetKm: 50, raceKm: 10 });
    const partial = computeVolumePlan({
      totalWeeks: 8,
      phaseSchedule: schedule,
      startWeeklyKm: 40,
      peakTargetKm: 50,
      raceKm: 10,
      weekDays: [3, 7, 7, 7, 7, 7, 7, 7],
    });
    expect(partial.targets[0]).toBe(Math.round((full.targets[0] * 3) / 7));
    expect(partial.targets.slice(1)).toEqual(full.targets.slice(1));
  });

  it("resolveTaperWeeks: kurze Rennwoche fügt eine Woche hinzu, Aufbau behält mindestens 2 Wochen", () => {
    expect(resolveTaperWeeks({ distKey: 10, totalWeeks: 8, raceWeekDays: 7 })).toBe(1);
    expect(resolveTaperWeeks({ distKey: 10, totalWeeks: 8, raceWeekDays: 2 })).toBe(2);
    expect(resolveTaperWeeks({ distKey: 42.2, totalWeeks: 20, raceWeekDays: 2 })).toBe(3);
    expect(resolveTaperWeeks({ distKey: 42.2, totalWeeks: 6, raceWeekDays: 2 })).toBe(2);
  });
});

// ── fix/plan-volume-guards: Spitze, 10-%-Anstieg, Rennwoche, Lauftage (Folgepunkt f) ────────────────────────────
describe("Volumen-Grenzen über buildVolumeContext", () => {
  const { buildVolumeContext, parseWeeklyKmRangeMax, runDaysFromRules } = require("../../api/_lib/deterministicPlanGenerator");
  const { weekCapacityKm } = require("../../api/_lib/planInvariants");
  const { MAX_WEEKLY_GROWTH, RACE_WEEK_MAX_SHARE } = require("../../api/_lib/weeklyVolumeProgression");
  const { normalizeTrainingPlan } = require("../planV2/normalizeTrainingPlan");

  const localDay = (deDate) => parseOnboardingRaceDate(deDate);
  // Live-Pläne a0b9b6c1 / cd555706 plus Matrix-Kombinationen mit ehrgeizigen Zielzeiten und "80+"
  const PROFILES = [
    { id: "M 2:50 60–80 16 Wo.", start: "09.11.2026", race: "28.02.2027", km: 42.195, time: "2:50:00", goal: "time", range: "60–80 km" },
    { id: "HM 1:35 40–60 12 Wo.", start: "09.11.2026", race: "31.01.2027", km: 21.0975, time: "1:35:00", goal: "time", range: "40–60 km" },
    { id: "M 2:30 80+ 20 Wo.", start: "12.10.2026", race: "28.02.2027", km: 42.195, time: "2:30:00", goal: "time", range: "80+ km" },
    { id: "10 km 38:00 20–40 8 Wo.", start: "05.10.2026", race: "29.11.2026", km: 10, time: "38:00", goal: "time", range: "20–40 km" },
    { id: "M Finisher 3 Läufe 60–80", start: "09.11.2026", race: "28.02.2027", km: 42.195, time: null, goal: "finish", range: "60–80 km",
      rules: { restDays: [1, 3, 5, 6], longRunDay: 0, intervalDay: 2, maxTrainingDaysPerWeek: 3 } },
    ...COMBOS.filter((c) => c.raceDow === 0 || c.raceDow === 2).map((c) => ({
      id: c.id, start: c.profile.planStartDate, race: c.profile.raceDate, km: c.profile.raceDistanceKm,
      time: c.profile.raceTargetTime, goal: c.profile.raceGoal, range: c.profile.weeklyKmRange,
    })),
  ];
  const contextOf = (p) =>
    buildVolumeContext({
      startDay: localDay(p.start),
      raceDay: localDay(p.race),
      raceDistanceKm: p.km,
      raceTargetTime: p.time,
      raceGoal: p.goal,
      weeklyKmRange: p.range,
      rules: p.rules ?? defaultStructureForWeeks(12).rules,
    });
  const cases = PROFILES.map((p) => [p.id, p, contextOf(p)]);

  it.each(cases)("%s: Spitze ≤ Obergrenze der Umfangsangabe × 1,2 und ≥ Start × 1,10", (_id, p, ctx) => {
    expect(ctx.effectivePeakKm).toBeLessThanOrEqual(Math.max(Math.floor(parseWeeklyKmRangeMax(p.range) * 1.2), Math.round(ctx.weeklyTarget * 1.1)));
    expect(ctx.reachedPeakKm).toBeLessThanOrEqual(ctx.effectivePeakKm);
    expect(Math.max(...ctx.weeklyKmTargets.slice(0, ctx.totalWeeks - ctx.taperWeeks))).toBe(ctx.reachedPeakKm);
  });

  it.each(cases)("%s: Ziel[w] ≤ 1,1 × max(Ziel[w−1], Niveau vor Entlastung), volle Wochen", (_id, _p, ctx) => {
    const peakWeek = ctx.totalWeeks - ctx.taperWeeks;
    const full = (w) => (ctx.weeklyKmTargets[w - 1] * 7) / ctx.weekDays[w - 1];
    let level = null;
    for (let w = 2; w <= peakWeek; w += 1) {
      const before = full(w - 1);
      if (!ctx.isDeload[w - 2]) level = before;
      const ref = Math.max(before, level ?? 0);
      // Teilwochen am Start werden anteilig gerundet: ±0,5 km Rundung auf 7 Tage hochgerechnet
      const tolerance = ctx.weekDays[w - 2] < 7 ? (0.5 * 7) / ctx.weekDays[w - 2] : 0;
      if (ctx.weekDays[w - 1] >= 7) expect(full(w)).toBeLessThanOrEqual(MAX_WEEKLY_GROWTH * ref + tolerance + 1e-9);
    }
  });

  it.each(cases)("%s: Rennwoche ohne Rennen ≤ 40 % der erreichten Spitze", (_id, p, ctx) => {
    const raceWeek = ctx.weeklyKmTargets[ctx.totalWeeks - 1];
    expect(raceWeek - p.km).toBeLessThanOrEqual(RACE_WEEK_MAX_SHARE * ctx.reachedPeakKm + 0.5);
  });

  it.each(cases)("%s: Ziele liegen in jeder Aufbauwoche unter dem, was die Lauftage tragen", (_id, _p, ctx) => {
    const peakWeek = ctx.totalWeeks - ctx.taperWeeks;
    for (let w = 1; w <= peakWeek; w += 1) {
      expect(ctx.weeklyKmTargets[w - 1]).toBeLessThanOrEqual(Math.floor(ctx.weekCapacityKm[w - 1]) + 0.5);
    }
  });

  it("Live-Plan a0b9b6c1 (Marathon 2:50, 60–80 km): Spitze 96 statt 150, Rennwoche ≤ 38,4 km ohne Rennen", () => {
    const ctx = contextOf(PROFILES[0]);
    expect(ctx.effectivePeakKm).toBe(96);
    expect(Math.max(...ctx.weeklyKmTargets)).toBeLessThanOrEqual(96);
    expect(ctx.weeklyKmTargets[15] - 42.195).toBeLessThanOrEqual(38.4 + 0.5);
  });

  it("Live-Plan cd555706 (HM 1:35, 40–60 km): Spitze 72 statt 85, kein +45 %/+51 % mehr", () => {
    const ctx = contextOf(PROFILES[1]);
    expect(ctx.effectivePeakKm).toBe(72);
    const t = ctx.weeklyKmTargets;
    expect(t[4]).toBeLessThanOrEqual(Math.floor(1.1 * Math.max(t[3], t[2])));
    expect(t[8]).toBeLessThanOrEqual(Math.floor(1.1 * Math.max(t[7], t[6])));
  });

  it("80+ zählt als 90: Spitze höchstens 108 km", () => {
    expect(parseWeeklyKmRangeMax("80+ km")).toBe(90);
    expect(contextOf(PROFILES[2]).effectivePeakKm).toBe(108);
  });

  it("10-%-Grenze geht vor der Spitze: Hinweis im Plan-Metadatum, übersteht normalizeTrainingPlan", () => {
    // Kurzer Plan: von 50 km auf 85 km in 4 Aufbauwochen geht mit +10 % nicht
    const ctx = computeVolumePlan({
      totalWeeks: 6,
      phaseSchedule: applyTaperToSchedule(buildWeekPhaseSchedule(6, defaultStructureForWeeks(6).phases), 2),
      startWeeklyKm: 50,
      peakTargetKm: 85,
      raceKm: 21.1,
    });
    expect(ctx.peakReached).toBe(false);
    expect(ctx.peakLimit).toBe("growth");
    expect(ctx.reachedPeakKm).toBeLessThanOrEqual(Math.floor(50 * 1.1 ** 3));

    const finisher3 = contextOf(PROFILES[4]);
    expect(finisher3.runDays).toBe(3);
    expect(finisher3.volumeNote).toEqual({ code: "peak-not-reached", reason: "run-days", targetPeakKm: 77, reachedPeakKm: finisher3.reachedPeakKm });

    const plan = {
      version: 2,
      workouts: [{ id: "a", dateIso: "2026-11-09T12:00:00.000Z", sport: "run", sessionType: "easy", title: "Lauf", km: 8 }],
      weeks: [],
      meta: { volumeNote: finisher3.volumeNote },
    };
    expect(normalizeTrainingPlan(plan).meta).toEqual({ volumeNote: finisher3.volumeNote });
    expect(normalizeTrainingPlan({ ...plan, meta: { volumeNote: { code: "x" } } }).meta).toBeUndefined();
    expect(normalizeTrainingPlan({ ...plan, meta: undefined }).meta).toBeUndefined();
  });

  it("Lauftage aus den Regeln: Ruhetage, Rad/Kraft und maxTrainingDaysPerWeek", () => {
    expect(runDaysFromRules(undefined)).toEqual({ runDays: 6, hardDays: 2 });
    expect(runDaysFromRules({ restDays: [1], maxTrainingDaysPerWeek: 5, intervalDay: 2, tempoDay: 4, longRunDay: 0 })).toEqual({ runDays: 5, hardDays: 2 });
    expect(runDaysFromRules({ restDays: [1, 3, 5, 6], maxTrainingDaysPerWeek: 3, intervalDay: 2, longRunDay: 0 })).toEqual({ runDays: 3, hardDays: 1 });
    expect(runDaysFromRules({ restDays: [1], bikeDays: [3], strengthDays: [5], intervalDay: 2, tempoDay: 3, longRunDay: 0 })).toEqual({ runDays: 4, hardDays: 1 });
  });

  it("Kapazität einer Woche: Long Run bis zur Grenze, harte Einheiten bis zur Obergrenze, lockere ≤ 60 %", () => {
    // 3 Läufe (Long Run 50 %, Intervall ≤ 16 km → geformt 14,7 km, locker ≤ 0,6 × 24): 24 + 14,7 + 14,4
    expect(weekCapacityKm({ runDays: 3, hardDays: 1, longMaxKm: 24, raceKm: 42.195 })).toBeCloseTo(53.1, 1);
    // 2 Läufe tragen nie die volle Woche (50 % + 30 %): was der längste Long Run trägt
    expect(weekCapacityKm({ runDays: 2, hardDays: 0, longMaxKm: 20, raceKm: 10 })).toBeCloseTo(32, 1);
    expect(weekCapacityKm({ runDays: 6, hardDays: 2, longMaxKm: 32, raceKm: 42.195 })).toBeGreaterThan(100);
  });
});
