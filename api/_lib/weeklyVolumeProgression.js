"use strict";

// Fixer Mittelwert der bisherigen Entlastungsspanne (-25% bis -30%), damit die Dip-Tiefe
// konsistent und reproduzierbar ist statt von Claude erraten zu werden.
const DELOAD_FACTOR = 0.72;
const DELOAD_EVERY_N_WEEKS = 4;
const TAPER_FRACTIONS = [0.7, 0.5, 0.3];

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function findLastPeakWeekIndex(phaseSchedule) {
  let lastIdx = -1;
  (phaseSchedule ?? []).forEach((info, idx) => {
    if (info?.phase === "peak") lastIdx = idx;
  });
  return lastIdx;
}

function isDeloadWeek(weekNumber, phase) {
  if (phase === "taper") return false;
  return weekNumber % DELOAD_EVERY_N_WEEKS === 0;
}

/**
 * Berechnet für jede Woche des Plans ein deterministisches Ziel-Wochenvolumen (km).
 *
 * Kernidee: Es gibt eine glatte Trend-Linie (Basis-Kurve OHNE Entlastungsdips), die von
 * startWeeklyKm bis peakTargetKm in der letzten Peak-Woche verläuft. Entlastungswochen sind
 * ein Dip relativ zu DIESER Trend-Linie — die Trend-Linie selbst wird durch die Entlastung
 * nicht "zurückgesetzt", wodurch das Wochenvolumen über den ganzen Zyklus strukturell weiter
 * in Richtung Peak wächst (statt sich die Steigerung durch die Entlastung wieder aufzuheben).
 *
 * @param {{ totalWeeks: number, phaseSchedule: Array<{ phase: string }>, startWeeklyKm: number, peakTargetKm: number }} params
 * @returns {number[]} weeklyKmTargets — Index = Wochennummer - 1, Wert = Ziel-km für diese Woche
 */
function computeWeeklyVolumeTargets({ totalWeeks, phaseSchedule, startWeeklyKm, peakTargetKm }) {
  const weeklyKmTargets = new Array(totalWeeks).fill(0);
  const lastPeakIdx = findLastPeakWeekIndex(phaseSchedule);
  const lastPeakWeekNumber = lastPeakIdx >= 0 ? lastPeakIdx + 1 : totalWeeks;

  const trend = (weekNumber) => {
    if (lastPeakWeekNumber <= 1) return peakTargetKm;
    const x = (weekNumber - 1) / (lastPeakWeekNumber - 1);
    return startWeeklyKm + (peakTargetKm - startWeeklyKm) * smoothstep(x);
  };

  for (let weekNumber = 1; weekNumber <= totalWeeks; weekNumber += 1) {
    const info = phaseSchedule?.[weekNumber - 1] ?? {};
    const phase = info.phase ?? "base";

    let value;
    if (weekNumber <= lastPeakWeekNumber) {
      const trendValue = trend(weekNumber);
      value = isDeloadWeek(weekNumber, phase) ? trendValue * DELOAD_FACTOR : trendValue;
    } else {
      const taperStepIndex = weekNumber - lastPeakWeekNumber; // 1, 2, 3, ...
      const fraction =
        TAPER_FRACTIONS[Math.min(taperStepIndex, TAPER_FRACTIONS.length) - 1] ??
        TAPER_FRACTIONS[TAPER_FRACTIONS.length - 1];
      value = peakTargetKm * fraction;
    }

    weeklyKmTargets[weekNumber - 1] = Math.max(0, Math.round(value));
  }

  return weeklyKmTargets;
}

module.exports = { computeWeeklyVolumeTargets };
