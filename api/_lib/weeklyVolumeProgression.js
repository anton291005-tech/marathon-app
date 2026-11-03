"use strict";

// Fixer Mittelwert der bisherigen Entlastungsspanne (-25% bis -30%), damit die Dip-Tiefe
// konsistent und reproduzierbar ist statt von Claude erraten zu werden.
const DELOAD_FACTOR = 0.72;
const DELOAD_EVERY_N_WEEKS = 4;
// Mindestzuwachs von Start- zu Spitzenumfang, auch wenn die Referenz darunter liegt (Finisher-Ziele).
const MIN_PEAK_GROWTH = 1.1;
// Spitze höchstens Obergrenze der Umfangsangabe × 1,2 (freigegeben von Anton am 2026-11-03).
const RANGE_PEAK_FACTOR = 1.2;
// Wochenanstieg höchstens 10 %: Ziel[w] ≤ 1,1 × max(Ziel[w−1], Niveau vor der Entlastung). Hat Vorrang vor der Spitze.
const MAX_WEEKLY_GROWTH = 1.1;
// Rennwoche ohne Rennen höchstens 40 % der erreichten Spitze.
const RACE_WEEK_MAX_SHARE = 0.4;
// Eine Rennwoche mit weniger Tagen zählt nicht als volle Taper-Woche: die Woche davor wird mitgetapert.
const SHORT_RACE_WEEK_DAYS = 4;
// Anteil am Spitzenumfang je Taper-Woche (Reihenfolge: erste Taper-Woche → Rennwoche).
const TAPER_FRACTIONS = {
  1: [0.6],
  2: [0.75, 0.5],
  3: [0.8, 0.6, 0.4],
};

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/** Taper-Wochen je Distanz, ohne Berücksichtigung einer kurzen Rennwoche. */
function taperWeeksFor(distKey, totalWeeks) {
  if (distKey === 21.1) return totalWeeks >= 10 ? 2 : 1;
  if (distKey === 42.2 || distKey === "ultra") return totalWeeks >= 8 ? 2 : 1;
  return 1;
}

/**
 * Anzahl Taper-Wochen inkl. Rennwoche. Hat die Rennwoche weniger als SHORT_RACE_WEEK_DAYS Tage
 * (z. B. Rennen am Dienstag), kommt die Woche davor als Taper-Woche dazu. Mindestens 2 Wochen bleiben Aufbau.
 */
function resolveTaperWeeks({ distKey, totalWeeks, raceWeekDays }) {
  let taper = taperWeeksFor(distKey, totalWeeks);
  if (raceWeekDays < SHORT_RACE_WEEK_DAYS) taper += 1;
  return Math.max(1, Math.min(taper, totalWeeks - 2, 3));
}

/**
 * Spitzenumfang: Referenz der Zielzeit, gedeckelt auf Obergrenze der Umfangsangabe × 1,2 (`rangeMaxKm`), aber nie
 * weniger als Startumfang + 10 %.
 */
function resolvePeakKm({ referencePeakKm, startWeeklyKm, rangeMaxKm }) {
  const reference = Math.round(referencePeakKm);
  const capped = rangeMaxKm > 0 ? Math.min(reference, Math.floor(rangeMaxKm * RANGE_PEAK_FACTOR + 1e-9)) : reference;
  return Math.max(capped, Math.round(startWeeklyKm * MIN_PEAK_GROWTH));
}

/**
 * Setzt die letzten `taperWeeks` Wochen auf Taper, die letzte Nicht-Taper-Woche auf Peak und
 * nummeriert weekInPhase/weeksInPhase neu. Nur der Phasenverlauf wird korrigiert, Label und Fokus bleiben.
 */
function applyTaperToSchedule(schedule, taperWeeks) {
  const total = schedule.length;
  const firstTaperIdx = total - taperWeeks;
  const next = schedule.map((entry, idx) => {
    if (idx >= firstTaperIdx) return { ...entry, phase: "taper" };
    if (entry.phase === "taper") return { ...entry, phase: "build" };
    return { ...entry };
  });
  if (firstTaperIdx - 1 >= 0) next[firstTaperIdx - 1].phase = "peak";

  let runStart = 0;
  for (let i = 1; i <= next.length; i += 1) {
    if (i === next.length || next[i].phase !== next[runStart].phase) {
      const len = i - runStart;
      for (let k = runStart; k < i; k += 1) {
        next[k].weekInPhase = k - runStart + 1;
        next[k].weeksInPhase = len;
      }
      runStart = i;
    }
  }
  return next;
}

function countTrailingTaperWeeks(phaseSchedule) {
  let n = 0;
  for (let i = (phaseSchedule ?? []).length - 1; i >= 0; i -= 1) {
    if (phaseSchedule[i]?.phase !== "taper") break;
    n += 1;
  }
  return n;
}

/**
 * Deterministisches Ziel-Wochenvolumen (km) und Entlastungs-Flags für jede Woche.
 *
 * - Basis-Kurve (smoothstep) von startWeeklyKm bis peakTargetKm in der letzten Nicht-Taper-Woche.
 *   Entlastungswochen sind ein Dip relativ zu dieser Kurve und setzen sie nicht zurück.
 * - Je Woche höchstens `weekCapacityKm[w]` (was die Lauftage tragen, Folgepunkt f) und höchstens
 *   1,1 × max(Ziel der Vorwoche, Niveau vor der Entlastung). Beides geht vor der Spitze: wird sie nicht erreicht,
 *   melden `peakReached`/`peakLimit` das (Hinweis im Plan-Metadatum).
 * - Entlastung im 3:1-Rhythmus, nie in der Peak-Woche, der Woche davor, im Taper und in `protectedWeeks`
 *   (die Woche mit dem längsten Lauf wird nicht entlastet). Während der Entlastung steigt das Niveau nicht.
 * - Taper: Anteil an der erreichten Spitze laut TAPER_FRACTIONS. Die Rennwoche = Renndistanz plus Anteil für die
 *   übrigen Tage bis zum Rennen (Tage davor / 7), höchstens 40 % der erreichten Spitze.
 * - Wochen mit weniger als 7 Tagen (Planstart mitten in der Woche) werden anteilig skaliert; Anstieg und Kapazität
 *   gelten für den Wert einer vollen Woche.
 *
 * @param {{
 *   totalWeeks: number,
 *   phaseSchedule: Array<{ phase: string }>,
 *   startWeeklyKm: number,
 *   peakTargetKm: number,
 *   weekDays?: number[],
 *   raceKm?: number,
 *   protectedWeeks?: number[],
 *   weekCapacityKm?: number[],
 * }} params
 * @returns {{ targets: number[], isDeload: boolean[], fullWeekKm: number[], reachedPeakKm: number,
 *   peakReached: boolean, peakLimit: "growth"|"run-days"|null }}
 */
function computeVolumePlan({
  totalWeeks,
  phaseSchedule,
  startWeeklyKm,
  peakTargetKm,
  weekDays,
  raceKm = 0,
  protectedWeeks = [],
  weekCapacityKm,
}) {
  const targets = new Array(totalWeeks).fill(0);
  const isDeload = new Array(totalWeeks).fill(false);
  const fullWeekKm = new Array(totalWeeks).fill(0);
  const taperWeeks = Math.min(countTrailingTaperWeeks(phaseSchedule), Math.max(0, totalWeeks - 1));
  const peakWeek = Math.max(1, totalWeeks - taperWeeks);
  const fractions = TAPER_FRACTIONS[Math.min(Math.max(taperWeeks, 1), 3)];

  const trend = (weekNumber) => {
    if (peakWeek <= 1) return peakTargetKm;
    const x = (weekNumber - 1) / (peakWeek - 1);
    return startWeeklyKm + (peakTargetKm - startWeeklyKm) * smoothstep(x);
  };

  // Aufbau bis zur Spitze: Werte einer vollen Woche, ganzzahlig
  let previous = null;
  let level = null;
  let peakLimit = null;
  for (let weekNumber = 1; weekNumber <= peakWeek; weekNumber += 1) {
    const capacity = weekCapacityKm?.[weekNumber - 1];
    let full = Math.round(trend(weekNumber));
    let limit = null;
    if (capacity > 0 && full > Math.floor(capacity)) {
      full = Math.floor(capacity);
      limit = "run-days";
    }
    if (previous != null) {
      const growthCap = Math.floor(MAX_WEEKLY_GROWTH * Math.max(previous, level ?? 0) + 1e-9);
      if (full > growthCap) {
        full = growthCap;
        limit = "growth";
      }
    }
    full = Math.max(1, full);
    const deload =
      weekNumber % DELOAD_EVERY_N_WEEKS === 0 && weekNumber <= peakWeek - 2 && !protectedWeeks.includes(weekNumber);
    isDeload[weekNumber - 1] = deload;
    const value = deload ? Math.round(full * DELOAD_FACTOR) : full;
    fullWeekKm[weekNumber - 1] = value;
    if (!deload) level = value;
    previous = value;
    if (weekNumber === peakWeek) peakLimit = limit;
  }
  const reachedPeakKm = fullWeekKm[peakWeek - 1];
  const peakReached = reachedPeakKm >= Math.round(peakTargetKm);

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const days = weekDays?.[weekNumber - 1] ?? 7;
    const isRaceWeek = weekNumber === totalWeeks;
    let value;
    if (weekNumber <= peakWeek) {
      value = fullWeekKm[weekNumber - 1];
      if (days < 7) value = (value * days) / 7;
    } else {
      const fraction = fractions[Math.min(weekNumber - peakWeek, fractions.length) - 1];
      if (isRaceWeek) {
        // Rennwoche: Rennen + anteiliges Volumen für die Tage davor (Renntag selbst zählt über raceKm).
        const share = Math.min((fraction * Math.max(0, Math.min(days, 7) - 1)) / 7, RACE_WEEK_MAX_SHARE);
        value = raceKm + reachedPeakKm * share;
        fullWeekKm[weekNumber - 1] = reachedPeakKm * share;
      } else {
        value = reachedPeakKm * fraction;
        fullWeekKm[weekNumber - 1] = value;
        if (days < 7) value = (value * days) / 7;
      }
    }
    targets[weekNumber - 1] = Math.max(0, Math.round(value));
  }

  return {
    targets,
    isDeload,
    fullWeekKm,
    reachedPeakKm,
    peakReached,
    peakLimit: peakReached ? null : (peakLimit ?? "growth"),
  };
}

/** Kompatible Kurzform: nur die Ziel-km. */
function computeWeeklyVolumeTargets(params) {
  return computeVolumePlan(params).targets;
}

module.exports = {
  computeWeeklyVolumeTargets,
  computeVolumePlan,
  taperWeeksFor,
  resolveTaperWeeks,
  resolvePeakKm,
  applyTaperToSchedule,
  countTrailingTaperWeeks,
  DELOAD_FACTOR,
  MIN_PEAK_GROWTH,
  RANGE_PEAK_FACTOR,
  MAX_WEEKLY_GROWTH,
  RACE_WEEK_MAX_SHARE,
  SHORT_RACE_WEEK_DAYS,
};
