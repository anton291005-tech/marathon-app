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
