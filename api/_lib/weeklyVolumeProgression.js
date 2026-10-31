"use strict";

// Fixer Mittelwert der bisherigen Entlastungsspanne (-25% bis -30%), damit die Dip-Tiefe
// konsistent und reproduzierbar ist statt von Claude erraten zu werden.
const DELOAD_FACTOR = 0.72;
const DELOAD_EVERY_N_WEEKS = 4;
// Mindestzuwachs von Start- zu Spitzenumfang, auch wenn die Referenz darunter liegt (Finisher-Ziele).
const MIN_PEAK_GROWTH = 1.1;
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

/** Spitzenumfang: Referenz, aber nie weniger als Startumfang + 10 %. */
function resolvePeakKm({ referencePeakKm, startWeeklyKm }) {
  return Math.max(Math.round(referencePeakKm), Math.round(startWeeklyKm * MIN_PEAK_GROWTH));
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
 * - Entlastung im 3:1-Rhythmus, nie in der Peak-Woche, der Woche davor, im Taper und in `protectedWeeks`
 *   (die Woche mit dem längsten Lauf wird nicht entlastet).
 * - Taper: Anteil am Spitzenumfang laut TAPER_FRACTIONS. Die Rennwoche = Renndistanz plus Anteil für die
 *   übrigen Tage bis zum Rennen (Tage davor / 7), nie das Volumen einer vollen Woche.
 * - Wochen mit weniger als 7 Tagen (Planstart mitten in der Woche) werden anteilig skaliert.
 *
 * @param {{
 *   totalWeeks: number,
 *   phaseSchedule: Array<{ phase: string }>,
 *   startWeeklyKm: number,
 *   peakTargetKm: number,
 *   weekDays?: number[],
 *   raceKm?: number,
 * }} params
 * @returns {{ targets: number[], isDeload: boolean[] }}
 */
function computeVolumePlan({
  totalWeeks,
  phaseSchedule,
  startWeeklyKm,
  peakTargetKm,
  weekDays,
  raceKm = 0,
  protectedWeeks = [],
}) {
  const targets = new Array(totalWeeks).fill(0);
  const isDeload = new Array(totalWeeks).fill(false);
  const taperWeeks = Math.min(countTrailingTaperWeeks(phaseSchedule), Math.max(0, totalWeeks - 1));
  const peakWeek = Math.max(1, totalWeeks - taperWeeks);
  const fractions = TAPER_FRACTIONS[Math.min(Math.max(taperWeeks, 1), 3)];

  const trend = (weekNumber) => {
    if (peakWeek <= 1) return peakTargetKm;
    const x = (weekNumber - 1) / (peakWeek - 1);
    return startWeeklyKm + (peakTargetKm - startWeeklyKm) * smoothstep(x);
  };

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const days = weekDays?.[weekNumber - 1] ?? 7;
    const isRaceWeek = weekNumber === totalWeeks;
    let value;

    if (weekNumber <= peakWeek) {
      const deload =
        weekNumber % DELOAD_EVERY_N_WEEKS === 0 && weekNumber <= peakWeek - 2 && !protectedWeeks.includes(weekNumber);
      isDeload[weekNumber - 1] = deload;
      value = deload ? trend(weekNumber) * DELOAD_FACTOR : trend(weekNumber);
      if (days < 7) value = (value * days) / 7;
    } else {
      const fraction = fractions[Math.min(weekNumber - peakWeek, fractions.length) - 1];
      if (isRaceWeek) {
        // Rennwoche: Rennen + anteiliges Volumen für die Tage davor (Renntag selbst zählt über raceKm).
        value = raceKm + (peakTargetKm * fraction * Math.max(0, Math.min(days, 7) - 1)) / 7;
      } else {
        value = peakTargetKm * fraction;
        if (days < 7) value = (value * days) / 7;
      }
    }

    targets[weekNumber - 1] = Math.max(0, Math.round(value));
  }

  return { targets, isDeload };
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
  SHORT_RACE_WEEK_DAYS,
};
