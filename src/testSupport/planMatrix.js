// Gemeinsame Testmatrix für die Plan-Invarianten (api/_lib/*): Distanz × Planlänge × Ziel × Renntag.
// Liegt bewusst nicht unter __tests__, damit Jest die Datei nicht als Testdatei einsammelt.

const DISTANCES = [
  { key: "5k", km: 5, label: "5 km", weekly: "20–40 km", time: "25:00" },
  { key: "10k", km: 10, label: "10 km", weekly: "40–60 km", time: "50:00" },
  { key: "hm", km: 21.0975, label: "Halbmarathon", weekly: "40–60 km", time: "1:50:00" },
  { key: "m", km: 42.195, label: "Marathon", weekly: "60–80 km", time: "3:45:00" },
];
const WEEK_COUNTS = [6, 8, 12, 16, 20];
const GOALS = ["finish", "time"];
// 0 = Sonntag (volle Rennwoche), 2 = Dienstag (kurze Rennwoche, wie im Audit-Plan)
const RACE_DOWS = [0, 2];

const RACE_WEEK_MONDAY = Date.UTC(2026, 10, 30); // Mo 30.11.2026
const DAY_MS = 86400000;

function ymdOf(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function deDate(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

/** Eine Kombination: Start immer ein Montag, Rennwoche ist die letzte der `weeks` Wochen. */
function buildCombo(distance, weeks, goal, raceDow) {
  const raceMs = RACE_WEEK_MONDAY + (raceDow === 0 ? 6 : raceDow - 1) * DAY_MS;
  const startMs = RACE_WEEK_MONDAY - (weeks - 1) * 7 * DAY_MS;
  return {
    id: `${distance.key}-${weeks}w-${goal}-${raceDow === 0 ? "So" : "Di"}`,
    distance,
    weeks,
    goal,
    raceDow,
    raceYmd: ymdOf(raceMs),
    startYmd: ymdOf(startMs),
    profile: {
      raceDistanceKm: distance.km,
      raceDistanceLabel: distance.label,
      raceGoal: goal,
      raceTargetTime: goal === "time" ? distance.time : null,
      weeklyKmRange: distance.weekly,
      raceDate: deDate(raceMs),
      planStartDate: deDate(startMs),
      planDurationDays: Math.round((raceMs - startMs) / DAY_MS),
      userPreferences: [],
    },
  };
}

const COMBOS = [];
for (const distance of DISTANCES) {
  for (const weeks of WEEK_COUNTS) {
    for (const goal of GOALS) {
      for (const raceDow of RACE_DOWS) {
        COMBOS.push(buildCombo(distance, weeks, goal, raceDow));
      }
    }
  }
}

module.exports = { DISTANCES, WEEK_COUNTS, GOALS, RACE_DOWS, COMBOS, buildCombo, ymdOf, deDate, DAY_MS };
