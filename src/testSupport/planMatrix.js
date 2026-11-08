// Gemeinsame Testmatrix für die Plan-Invarianten (api/_lib/*): Distanz × Planlänge × Ziel × Renntag.
// Liegt bewusst nicht unter __tests__, damit Jest die Datei nicht als Testdatei einsammelt.

const DISTANCES = [
  { key: "5k", km: 5, label: "5 km", weekly: "20–40 km", time: "25:00" },
  { key: "10k", km: 10, label: "10 km", weekly: "40–60 km", time: "50:00" },
  { key: "hm", km: 21.0975, label: "Halbmarathon", weekly: "40–60 km", time: "1:50:00" },
  { key: "m", km: 42.195, label: "Marathon", weekly: "60–80 km", time: "3:45:00" },
];
// Ehrgeizige Zielzeiten: Umfangsangabe liegt unter der Zielzeit-Referenz (Live-Pläne a0b9b6c1, cd555706), "80+"
const AMBITIOUS = [
  { key: "m-fast", km: 42.195, label: "Marathon", weekly: "60–80 km", time: "2:50:00" },
  { key: "hm-fast", km: 21.0975, label: "Halbmarathon", weekly: "40–60 km", time: "1:35:00" },
  { key: "m-80plus", km: 42.195, label: "Marathon", weekly: "80+ km", time: "2:40:00" },
];
const WEEK_COUNTS = [6, 8, 12, 16, 20];
const GOALS = ["finish", "time"];
// Renntag an jedem Wochentag (0 = Sonntag … 6 = Samstag); 2 = Dienstag wie im Audit- und im Live-Plan
const RACE_DOWS = [0, 1, 2, 3, 4, 5, 6];
// Teilwochen am Planstart nur mit So/Di-Rennen (volle bzw. kurze Rennwoche), sonst wird die Matrix zu groß
const PARTIAL_RACE_DOWS = [0, 2];
const DOW_LABEL = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

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
function buildCombo(distance, weeks, goal, raceDow, startOffset = 0) {
  const raceMs = RACE_WEEK_MONDAY + (raceDow === 0 ? 6 : raceDow - 1) * DAY_MS;
  // startOffset > 0: Planstart mitten in der ersten Woche (Mo + offset), die erste Woche ist eine Teilwoche
  const startMs = RACE_WEEK_MONDAY - (weeks - 1) * 7 * DAY_MS + startOffset * DAY_MS;
  return {
    id: `${distance.key}-${weeks}w-${goal}-${DOW_LABEL[raceDow]}${startOffset ? `-Start+${startOffset}` : ""}`,
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

for (const distance of AMBITIOUS) {
  for (const weeks of WEEK_COUNTS) {
    for (const raceDow of RACE_DOWS) {
      COMBOS.push(buildCombo(distance, weeks, "time", raceDow));
    }
  }
}

// Teilwoche am Planstart: Start Di…So der ersten Woche
const PARTIAL_COMBOS = [];
for (const distance of DISTANCES) {
  for (const weeks of [8, 12]) {
    for (const startOffset of [1, 2, 3, 4, 5, 6]) {
      for (const raceDow of PARTIAL_RACE_DOWS) {
        PARTIAL_COMBOS.push(buildCombo(distance, weeks, "finish", raceDow, startOffset));
      }
    }
  }
}

module.exports = { DISTANCES, AMBITIOUS, WEEK_COUNTS, GOALS, RACE_DOWS, COMBOS, PARTIAL_COMBOS, buildCombo, ymdOf, deDate, DAY_MS };
