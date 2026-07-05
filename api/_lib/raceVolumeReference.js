"use strict";

// Zeit-Schwellen in Minuten, Volumen in km/Woche
const VOLUME_REFERENCE = {
  5: [
    { maxMinutes: 16,  peakKm: [80, 110], baseKm: [55, 75], peakLongRunKm: 16, sessionsPerWeek: 7, qualityPercent: 20 },
    { maxMinutes: 18,  peakKm: [65, 90],  baseKm: [45, 60], peakLongRunKm: 14, sessionsPerWeek: 6, qualityPercent: 18 },
    { maxMinutes: 21,  peakKm: [50, 70],  baseKm: [35, 50], peakLongRunKm: 12, sessionsPerWeek: 5, qualityPercent: 15 },
    { maxMinutes: 24,  peakKm: [40, 55],  baseKm: [28, 40], peakLongRunKm: 10, sessionsPerWeek: 5, qualityPercent: 12 },
    { maxMinutes: 28,  peakKm: [30, 45],  baseKm: [20, 32], peakLongRunKm: 9,  sessionsPerWeek: 4, qualityPercent: 10 },
    { maxMinutes: Infinity, peakKm: [20, 35], baseKm: [14, 24], peakLongRunKm: 7, sessionsPerWeek: 4, qualityPercent: 8 },
  ],
  10: [
    { maxMinutes: 33,  peakKm: [90, 120], baseKm: [65, 85], peakLongRunKm: 20, sessionsPerWeek: 7, qualityPercent: 18 },
    { maxMinutes: 38,  peakKm: [70, 95],  baseKm: [50, 70], peakLongRunKm: 18, sessionsPerWeek: 6, qualityPercent: 16 },
    { maxMinutes: 45,  peakKm: [55, 75],  baseKm: [40, 55], peakLongRunKm: 16, sessionsPerWeek: 5, qualityPercent: 14 },
    { maxMinutes: 50,  peakKm: [45, 60],  baseKm: [32, 45], peakLongRunKm: 14, sessionsPerWeek: 5, qualityPercent: 12 },
    { maxMinutes: 55,  peakKm: [35, 50],  baseKm: [25, 35], peakLongRunKm: 12, sessionsPerWeek: 4, qualityPercent: 10 },
    { maxMinutes: Infinity, peakKm: [25, 40], baseKm: [18, 28], peakLongRunKm: 10, sessionsPerWeek: 4, qualityPercent: 8 },
  ],
  15: [
    { maxMinutes: 52,  peakKm: [100, 130], baseKm: [72, 95], peakLongRunKm: 24, sessionsPerWeek: 7, qualityPercent: 17 },
    { maxMinutes: 60,  peakKm: [80, 105],  baseKm: [58, 78], peakLongRunKm: 21, sessionsPerWeek: 6, qualityPercent: 15 },
    { maxMinutes: 70,  peakKm: [63, 85],  baseKm: [46, 62], peakLongRunKm: 19, sessionsPerWeek: 5, qualityPercent: 13 },
    { maxMinutes: 78,  peakKm: [50, 68],  baseKm: [36, 50], peakLongRunKm: 17, sessionsPerWeek: 5, qualityPercent: 11 },
    { maxMinutes: 86,  peakKm: [40, 55],  baseKm: [28, 40], peakLongRunKm: 15, sessionsPerWeek: 4, qualityPercent: 9 },
    { maxMinutes: Infinity, peakKm: [30, 42], baseKm: [20, 30], peakLongRunKm: 13, sessionsPerWeek: 4, qualityPercent: 8 },
  ],
  21.1: [
    { maxMinutes: 70,  peakKm: [110, 140], baseKm: [80, 105], peakLongRunKm: 24, sessionsPerWeek: 7, qualityPercent: 16 },
    { maxMinutes: 80,  peakKm: [90, 120],  baseKm: [65, 90],  peakLongRunKm: 22, sessionsPerWeek: 6, qualityPercent: 15 },
    { maxMinutes: 90,  peakKm: [75, 100],  baseKm: [55, 75],  peakLongRunKm: 20, sessionsPerWeek: 6, qualityPercent: 13 },
    { maxMinutes: 100, peakKm: [65, 85],   baseKm: [48, 65],  peakLongRunKm: 18, sessionsPerWeek: 5, qualityPercent: 12 },
    { maxMinutes: 110, peakKm: [55, 70],   baseKm: [40, 55],  peakLongRunKm: 16, sessionsPerWeek: 5, qualityPercent: 10 },
    { maxMinutes: 120, peakKm: [45, 60],   baseKm: [32, 45],  peakLongRunKm: 15, sessionsPerWeek: 4, qualityPercent: 9 },
    { maxMinutes: Infinity, peakKm: [35, 50], baseKm: [25, 38], peakLongRunKm: 13, sessionsPerWeek: 4, qualityPercent: 8 },
  ],
  42.2: [
    { maxMinutes: 150, peakKm: [160, 220], baseKm: [120, 160], peakLongRunKm: 35, sessionsPerWeek: 7, qualityPercent: 14 },
    { maxMinutes: 165, peakKm: [140, 170], baseKm: [105, 140], peakLongRunKm: 34, sessionsPerWeek: 7, qualityPercent: 13 },
    { maxMinutes: 180, peakKm: [120, 150], baseKm: [90, 120],  peakLongRunKm: 32, sessionsPerWeek: 6, qualityPercent: 12 },
    { maxMinutes: 195, peakKm: [100, 130], baseKm: [75, 100],  peakLongRunKm: 32, sessionsPerWeek: 6, qualityPercent: 11 },
    { maxMinutes: 210, peakKm: [90, 110],  baseKm: [65, 88],   peakLongRunKm: 30, sessionsPerWeek: 5, qualityPercent: 10 },
    { maxMinutes: 225, peakKm: [75, 95],   baseKm: [55, 75],   peakLongRunKm: 30, sessionsPerWeek: 5, qualityPercent: 9 },
    { maxMinutes: 240, peakKm: [65, 85],   baseKm: [48, 65],   peakLongRunKm: 28, sessionsPerWeek: 5, qualityPercent: 8 },
    { maxMinutes: 270, peakKm: [50, 70],   baseKm: [38, 52],   peakLongRunKm: 26, sessionsPerWeek: 4, qualityPercent: 7 },
    { maxMinutes: Infinity, peakKm: [40, 55], baseKm: [30, 42], peakLongRunKm: 24, sessionsPerWeek: 4, qualityPercent: 6 },
  ],
};

const ULTRA_REFERENCE = {
  finish:      { peakKm: [60, 100],  baseKm: [45, 75],  peakLongRunKm: 42, sessionsPerWeek: 5, qualityPercent: 5 },
  competitive: { peakKm: [110, 180], baseKm: [80, 130], peakLongRunKm: 50, sessionsPerWeek: 6, qualityPercent: 8 },
};

function nearestDistanceKey(raceDistanceKm) {
  const keys = [5, 10, 15, 21.1, 42.2];
  if (raceDistanceKm > 42.2) return "ultra";
  return keys.reduce((prev, curr) =>
    Math.abs(curr - raceDistanceKm) < Math.abs(prev - raceDistanceKm) ? curr : prev
  );
}

function parseTimeToMinutes(timeStr, distKey) {
  if (!timeStr) return null;
  const parts = timeStr.split(":").map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    const [a, b] = parts;
    if (distKey === 21.1 || distKey === 42.2 || distKey === "ultra") {
      return a * 60 + b;
    }
    return a + b / 60;
  }
  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  }
  return null;
}

function getRecommendedVolume(raceDistanceKm, raceTargetTime, raceGoal) {
  const distKey = nearestDistanceKey(raceDistanceKm);

  if (distKey === "ultra") {
    const tier = raceGoal === "finish" ? ULTRA_REFERENCE.finish : ULTRA_REFERENCE.competitive;
    return { ...tier, distKey, tier: raceGoal === "finish" ? "finish" : "competitive" };
  }

  const tiers = VOLUME_REFERENCE[distKey];

  if (raceGoal === "finish" || !raceTargetTime) {
    const last = tiers[tiers.length - 1];
    return { ...last, distKey, tier: "finisher" };
  }

  const minutes = parseTimeToMinutes(raceTargetTime, distKey);
  if (minutes === null) {
    const mid = tiers[Math.floor(tiers.length / 2)];
    return { ...mid, distKey, tier: "unparsed-fallback" };
  }

  const tier = tiers.find((t) => minutes <= t.maxMinutes) || tiers[tiers.length - 1];
  return { ...tier, distKey };
}

module.exports = { getRecommendedVolume, nearestDistanceKey, parseTimeToMinutes };
