// Plan-Quellen für die Invarianten-Matrix: deterministischer Generator und ein "Chaos-Claude",
// der absichtlich die Defekte aus dem Audit des 10-km-Plans liefert (fallender Umfang, Long Run in W1,
// Sa-Tempo vor So-Long-Run, Mi-Intervall direkt vor Do-Tempo (Live-Plan), harte Einheit 2 Tage vor dem Rennen,
// Läufe nach dem Rennen, GA2/HFmax-Text, km ≠ Beschreibung, eigenes Phasenlabel).

const { generateMarathonPlanV2ToRace, defaultStructureForWeeks } = require("../../api/_lib/deterministicPlanGenerator");
const { generateFullPlanByPhases } = require("../../api/_lib/phasedFullPlanGenerator");

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_MS = 86400000;

const localDate = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function deterministicPlan(combo) {
  const { profile } = combo;
  const rules = defaultStructureForWeeks(combo.weeks).rules;
  return generateMarathonPlanV2ToRace(
    localDate(combo.startYmd),
    localDate(combo.raceYmd),
    combo.goal,
    profile.raceDistanceKm,
    profile.weeklyKmRange,
    undefined,
    rules,
    undefined,
    profile.raceTargetTime ?? undefined,
  );
}

// ── Chaos-Claude ──────────────────────────────────────────────────────────────────────────
function chaosStructure(variant, weeks) {
  if (variant === "three-runs") {
    // Finisher-Plan mit drei Lauftagen: vier Wunsch-Ruhetage (Mo, Mi, Fr, Sa), Intervall Di, Long Run So
    return {
      analysis: "Chaos drei Läufe",
      phases: [
        { name: "base", weeks: Math.ceil(weeks * 0.4), label: "Aerober Grundlagenblock", focus: "Basis" },
        { name: "build", weeks: weeks - Math.ceil(weeks * 0.4), label: "Entwicklungsphase", focus: "Aufbau" },
      ],
      sessionNames: {},
      rules: { restDays: [1, 3, 5, 6], longRunDay: 0, intervalDay: 2, maxTrainingDaysPerWeek: 3, weeklyKmMultiplier: 1 },
    };
  }
  const phases =
    variant === "no-taper"
      ? [
          { name: "base", weeks: Math.ceil(weeks * 0.5), label: "Aerober Grundlagenblock", focus: "Basis" },
          { name: "build", weeks: Math.floor(weeks * 0.3), label: "Entwicklungsphase", focus: "Aufbau" },
          { name: "peak", weeks: weeks - Math.ceil(weeks * 0.5) - Math.floor(weeks * 0.3), label: "Spezifische Vorbereitung", focus: "Spitze" },
        ]
      : [
          { name: "base", weeks: 6, label: "Aerober Grundlagenblock", focus: "Basis" },
          { name: "build", weeks: 5, label: "Entwicklungsphase", focus: "Aufbau" },
          { name: "peak", weeks: 4, label: "Spezifische Vorbereitung", focus: "Spitze" },
          { name: "taper", weeks: 5, label: "Tapering", focus: "Erholen" },
        ];
  return {
    analysis: "Chaos",
    phases,
    sessionNames: {},
    // Samstag-Tempo direkt vor dem Sonntags-Long-Run, Intervall am Dienstag
    rules: { restDays: [1], longRunDay: 0, intervalDay: 2, tempoDay: 6, maxTrainingDaysPerWeek: 5, weeklyKmMultiplier: 1 },
  };
}

/**
 * Drei Läufe pro Woche: ungerade Wochen Long Run + Intervall + locker, gerade Wochen Long Run + 2× locker.
 * Dort sind I9 und die 30-%-Grenze nur mit der Gleichverteilung (longRunCap) gleichzeitig erfüllbar.
 */
function threeRunWorkoutsForWeek(wn, startIso, raceIso) {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY_MS;
  const workouts = [];
  for (let d = 0; d < 7; d += 1) {
    const ms = monday + d * DAY_MS;
    if (ms < start) continue;
    const ymd = new Date(ms).toISOString().slice(0, 10);
    const base = { id: `w${wn}-${DAY_NAMES[d].toLowerCase()}`, weekId: `w${wn}`, day: DAY_NAMES[d], date: ymd, dateIso: `${ymd}T12:00:00.000Z`, phase: "BUILD" };
    if (ymd === raceIso) workouts.push({ ...base, type: "race", title: "Renntag", km: 10, description: "Rennen." });
    else if (d === 1 && wn % 2 === 1) workouts.push({ ...base, type: "interval", title: "Intervalle", km: 9, description: "6×800 m im GA2-Bereich." });
    else if (d === 1 || d === 3) workouts.push({ ...base, type: "easy", title: "GA1-Lauf", km: 14, description: "Locker bei 65 % HFmax." });
    else if (d === 6) workouts.push({ ...base, type: "long", title: "Long Run", km: 8, description: "Langer Lauf über 20 km." });
    else workouts.push({ ...base, type: "rest", title: "Ruhetag", km: 0, description: "Frei." });
  }
  return workouts;
}

function chaosWorkoutsForWeek(wn, startIso, raceIso) {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const mondayOffset = (new Date(start).getUTCDay() + 6) % 7;
  const monday = start - mondayOffset * DAY_MS;
  const workouts = [];
  for (let d = 0; d < 7; d += 1) {
    const ms = monday + d * DAY_MS;
    if (ms < start) continue;
    const ymd = new Date(ms).toISOString().slice(0, 10);
    const id = `w${wn}-${DAY_NAMES[d].toLowerCase()}`;
    const base = { id, weekId: `w${wn}`, day: DAY_NAMES[d], date: ymd, dateIso: `${ymd}T12:00:00.000Z`, phase: "BUILD" };
    const km = 14 - wn * 0.4; // Umfang fällt
    if (ymd === raceIso) {
      workouts.push({ ...base, type: "race", title: "Renntag", km: 10, description: "Rennen." });
    } else if (d === 0) {
      // Montag: abwechselnd Ruhetag, Rad und Kraft mit GA-/HFmax-Text (Rad/Kraft dürfen den Textfilter nicht umgehen)
      if (wn % 3 === 1) workouts.push({ ...base, type: "rest", title: "Ruhetag vor Renntag", km: 0, description: "Frei." });
      else if (wn % 3 === 2) workouts.push({ ...base, sport: "bike", type: "bike", title: "GA1 Rad", km: 0, description: "GA1 bei 65 % HFmax, 120 bpm, Zone 4." });
      else workouts.push({ ...base, sport: "strength", type: "strength", title: "Kraft 70 % HFmax", km: 0, description: "Puls bei 140 bpm." });
    } else if (d === 1 && wn % 2 === 1) {
      workouts.push({ ...base, type: "interval", title: "Intervalle", km: 15, description: "2 km + 6×(3 min/90 s) + 2 km im GA2-Bereich, Zone 4–5." });
    } else if (d === 2 && wn % 2 === 0) {
      // Gerade Wochen wie W4–W7 im Live-Plan: Mi Intervall direkt vor dem Do-Tempo
      workouts.push({ ...base, type: "interval", title: "Rennspezifische Intervalle", km: 10, description: "WU 2 km + 5×800 m + AB 1,5 km." });
    } else if (d === 1 || d === 2) {
      workouts.push({ ...base, type: "easy", title: "GA1-Dauerlauf", km: Math.max(5, km), description: "Locker bei 60–70 % HFmax, GA1." });
    } else if (d === 3) {
      workouts.push({ ...base, type: "tempo", title: "Tempodauerlauf", km: 11, description: "Tempo-Block." });
    } else if (d === 4) {
      workouts.push({ ...base, type: "easy", title: "Lockerer Lauf", km: 8, description: "Locker." });
    } else if (d === 5) {
      workouts.push({ ...base, type: "tempo", title: "Samstags-Tempo", km: 12, description: "Zone 3–4 direkt vor dem Long Run." });
    } else {
      workouts.push({ ...base, type: "long", title: "Long Run", km: 16.5, description: "Langer Lauf über 18 km." });
    }
  }
  return workouts;
}

/**
 * Wie Claude im Live-Plan a0b9b6c1 (W6–W10): der lange Lauf liegt als "easy" ("Langer Lauf Ausbau") am Samstag,
 * Sonntag und Donnerstag frei, Freitags-Tempo direkt davor, lockere Läufe mit irreführendem Titel.
 */
function longEasyWorkoutsForWeek(wn, startIso, raceIso) {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY_MS;
  const workouts = [];
  for (let d = 0; d < 7; d += 1) {
    const ms = monday + d * DAY_MS;
    if (ms < start) continue;
    const ymd = new Date(ms).toISOString().slice(0, 10);
    const base = { id: `w${wn}-${DAY_NAMES[d].toLowerCase()}`, weekId: `w${wn}`, day: DAY_NAMES[d], date: ymd, dateIso: `${ymd}T12:00:00.000Z`, phase: "BUILD" };
    if (ymd === raceIso) workouts.push({ ...base, type: "race", title: "Renntag", km: 10, description: "Rennen." });
    else if (d === 1) workouts.push({ ...base, type: "interval", title: "Intervalle", km: 12, description: "5 × 2 km." });
    else if (d === 3 || d === 6) workouts.push({ ...base, type: "rest", title: "Ruhetag", km: 0, description: "Frei." });
    else if (d === 4) workouts.push({ ...base, type: "tempo", title: "Tempolauf Grundlage", km: 14, description: "Tempo." });
    else if (d === 5) workouts.push({ ...base, type: "easy", title: "Langer Lauf Ausbau", km: 24, description: "Langer lockerer Lauf." });
    else workouts.push({ ...base, type: "easy", title: d === 2 ? "Regenerationslauf" : "Lockerer Einstiegslauf", km: 9, description: "Locker." });
  }
  return workouts;
}

/** Antwort der Mock-Claude-API: Struktur-Aufruf oder Phasen-Aufruf (anhand des System-Prompts erkannt). */
function chaosReply(params, combo, variant) {
  const system = String(params.system ?? "");
  if (system.includes("phases (Phasenstruktur)")) {
    return { content: [{ type: "text", text: JSON.stringify(chaosStructure(variant, combo.weeks)) }], usage: {} };
  }
  const userMessage = String(params.messages?.[0]?.content ?? "");
  const weekRe = /- Woche (\d+) \(global w\d+\): startIso=(\d{4}-\d{2}-\d{2})/g;
  const workouts = [];
  const weeks = [];
  let match;
  while ((match = weekRe.exec(userMessage))) {
    weeks.push({ id: `w${match[1]}`, label: `Woche ${match[1]}`, startIso: match[2], totalKm: 0 });
    const forWeek =
      variant === "three-runs" ? threeRunWorkoutsForWeek : variant === "long-easy" ? longEasyWorkoutsForWeek : chaosWorkoutsForWeek;
    workouts.push(...forWeek(Number(match[1]), match[2], combo.raceYmd));
  }
  return { content: [{ type: "text", text: JSON.stringify({ weeks, workouts }) }], usage: {} };
}

/**
 * variant: "default" | "no-taper" | "three-runs" | "long-easy" — Chaos-Antworten;
 *          "fallback" — jeder Phasen-Aufruf schlägt fehl (nur der Struktur-Aufruf klappt) → deterministischer Fallback;
 *          "fallback-partial" — nur der erste Phasen-Aufruf schlägt fehl, die übrigen liefern Chaos.
 */
async function claudeRun(combo, variant, mockCreate) {
  let phaseCalls = 0;
  mockCreate.mockImplementation(async (params) => {
    const isStructure = String(params.system ?? "").includes("phases (Phasenstruktur)");
    if (!isStructure) {
      phaseCalls += 1;
      if (variant === "fallback" || (variant === "fallback-partial" && phaseCalls === 1)) {
        throw new Error("Claude phase failed (test)");
      }
    }
    return chaosReply(params, combo, ["no-taper", "three-runs", "long-easy"].includes(variant) ? variant : "default");
  });
  return generateFullPlanByPhases({ messages: { create: mockCreate } }, combo.profile);
}

async function claudePlan(combo, variant, mockCreate) {
  return (await claudeRun(combo, variant, mockCreate)).plan;
}

module.exports = { deterministicPlan, claudePlan, claudeRun, chaosReply, chaosWorkoutsForWeek, localDate };
