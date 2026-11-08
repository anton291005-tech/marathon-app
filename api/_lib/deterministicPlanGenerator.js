"use strict";

const { rebuildPlanFromWorkouts } = require("./planWorkoutUtils");
const { getRecommendedVolume } = require("./raceVolumeReference");
const {
  computeVolumePlan,
  resolveTaperWeeks,
  resolvePeakKm,
  applyTaperToSchedule,
} = require("./weeklyVolumeProgression");
const {
  enforcePlanInvariants,
  longRunMinDaysBeforeRace,
  weekCapacityKm,
  mondayOf: ymdMondayOf,
  addDays: ymdAddDays,
  diffDays: ymdDiffDays,
} = require("./planInvariants");

const DE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Ein Phasenname pro Phase, überall gleich (Wochenliste, Detail, Rückblick). Spiegel: src/planV2/trainingPhase.ts. */
const PHASE_LABEL_DE = { base: "Grundlage", build: "Aufbau", peak: "Spitze", taper: "Taper" };

function trainingPhaseLabelDe(phase) {
  return PHASE_LABEL_DE[phase] ?? PHASE_LABEL_DE.taper;
}

const RECOVERY_WEEK_FOCUS = "Entlastungswoche – Volumen reduziert, Adaptationen festigen";

/** Wochenlabel: Wochennummer und der eine Phasenname — kein Freitext aus Claudes Struktur. */
function weekLabelFor(weekNumber, phase) {
  return `Woche ${weekNumber} · ${trainingPhaseLabelDe(phase)}`;
}

function normalizeTrainingPhase(raw) {
  if (!raw) return "base";
  switch (String(raw).toUpperCase()) {
    case "BASE":
    case "MINI":
      return "base";
    case "BUILD":
    case "DEV":
    case "SPEC":
      return "build";
    case "PEAK":
      return "peak";
    case "TAPER":
      return "taper";
    default:
      if (raw === "base" || raw === "build" || raw === "peak" || raw === "taper") return raw;
      return "base";
  }
}

function startOfLocalDay(from) {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

function mondayOfWeekContaining(day) {
  const d = startOfLocalDay(day);
  const dow = d.getDay();
  const shift = (dow + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function formatDeDate(d) {
  return `${d.getDate()}. ${DE_MONTHS[d.getMonth()]}`;
}

function isoDateOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function intensityFor(sessionType) {
  if (sessionType === "interval" || sessionType === "tempo" || sessionType === "race") return "high";
  if (sessionType === "long") return "medium";
  return "low";
}

function sportFor(sessionType) {
  if (sessionType === "bike") return "bike";
  if (sessionType === "swim") return "swim";
  if (sessionType === "strength") return "strength";
  if (sessionType === "rest") return "rest";
  return "run";
}

function parseWeeklyKmTarget(range) {
  if (!range) return 50;
  if (range.includes("0–20")) return 15;
  if (range.includes("20–40")) return 30;
  if (range.includes("40–60")) return 50;
  if (range.includes("60–80")) return 70;
  if (range.includes("80+")) return 90;
  return 50;
}

/** Obergrenze der Umfangsangabe (km/Woche); "80+" zählt als 90 (freigegeben von Anton am 2026-11-03). */
function parseWeeklyKmRangeMax(range) {
  if (!range) return 60;
  if (range.includes("0–20")) return 20;
  if (range.includes("20–40")) return 40;
  if (range.includes("40–60")) return 60;
  if (range.includes("60–80")) return 80;
  if (range.includes("80+")) return 90;
  return 60;
}

const DOWS = [0, 1, 2, 3, 4, 5, 6];
/** Längster erlaubter Long Run: Spitze mindestens 15 % über dem Start, damit Umfang und Long Run wachsen können. */
const LONG_RUN_MIN_GROWTH_FOR_CAPACITY = 1.15;
const asDowList = (value) => (Array.isArray(value) ? value.filter((d) => DOWS.includes(d)) : []);

/**
 * Lauftage und harte Einheiten pro Woche aus den Strukturregeln (Folgepunkt f): Ruhetage und Rad/Schwimmen/Kraft
 * sind keine Lauftage, `maxTrainingDaysPerWeek` begrenzt die Trainingstage. Ohne Regeln: Montag frei, zwei harte
 * Einheiten.
 */
function runDaysFromRules(rules) {
  const rest = new Set(asDowList(rules?.restDays ?? [1]));
  const support = new Set(
    [...asDowList(rules?.bikeDays), ...asDowList(rules?.swimDays), ...asDowList(rules?.strengthDays)].filter((d) => !rest.has(d)),
  );
  const maxTraining = Number.isFinite(rules?.maxTrainingDaysPerWeek) && rules.maxTrainingDaysPerWeek > 0 ? rules.maxTrainingDaysPerWeek : 7;
  const trainingDays = Math.min(7 - rest.size, maxTraining);
  const runDays = Math.max(1, trainingDays - support.size);
  const longDay = rules?.longRunDay ?? 0;
  const hardSet = new Set(
    (rules ? [rules.intervalDay, rules.tempoDay] : [2, 4]).filter(
      (d) => DOWS.includes(d) && d !== longDay && !rest.has(d) && !support.has(d),
    ),
  );
  return { runDays, hardDays: Math.min(hardSet.size, Math.max(0, runDays - 2)) };
}

function getRaceConfig(distanceKm, goal = "time") {
  const d = distanceKm ?? 42.2;
  const isFinish = goal === "finish";

  if (d <= 5) {
    return {
      raceKm: 5,
      raceTitle: "5 km",
      peakLongRunKm: 12,
      taperLongRunKm: 8,
      planWeeksIdeal: 8,
      maxTrainingDaysPerWeek: isFinish ? 3 : 5,
      restDaysPattern: isFinish ? [1, 3, 5] : [1, 5],
    };
  }
  if (d <= 10) {
    return {
      raceKm: 10,
      raceTitle: "10 km",
      peakLongRunKm: 18,
      taperLongRunKm: 12,
      planWeeksIdeal: 10,
      maxTrainingDaysPerWeek: isFinish ? 3 : 5,
      restDaysPattern: isFinish ? [1, 3, 5] : [1, 5],
    };
  }
  if (d <= 15) {
    return {
      raceKm: 15,
      raceTitle: "15 km",
      peakLongRunKm: 22,
      taperLongRunKm: 14,
      planWeeksIdeal: 12,
      maxTrainingDaysPerWeek: isFinish ? 4 : 5,
      restDaysPattern: isFinish ? [1, 5] : [1],
    };
  }
  if (d <= 21.2) {
    return {
      raceKm: 21.1,
      raceTitle: "Halbmarathon",
      peakLongRunKm: 26,
      taperLongRunKm: 16,
      planWeeksIdeal: 16,
      maxTrainingDaysPerWeek: isFinish ? 4 : 6,
      restDaysPattern: isFinish ? [1, 5] : [1],
    };
  }
  return {
    raceKm: 42.2,
    raceTitle: "Marathon",
    peakLongRunKm: 32,
    taperLongRunKm: 18,
    planWeeksIdeal: 20,
    maxTrainingDaysPerWeek: isFinish ? 4 : 6,
    restDaysPattern: isFinish ? [1, 5] : [1],
  };
}

const DEFAULT_RACE_CONFIG = getRaceConfig(42.2);

function derivePhaseFromDur(dur) {
  const midDur = dur - 3;
  if (midDur <= 10) return "taper";
  if (midDur <= 21) return "peak";
  if (midDur <= 56) return "build";
  return "base";
}

function countWeeksInPlan(start, end, weekKeyOverrides) {
  let weekCount = 0;
  let lastWeekKey = "";
  const day = new Date(start);
  while (day.getTime() <= end.getTime()) {
    const mon = mondayOfWeekContaining(day);
    const monIso = isoDateOf(mon);
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      weekCount += 1;
      lastWeekKey = startIso;
    }
    day.setDate(day.getDate() + 1);
  }
  return weekCount;
}

function getPhaseProgress01(weekInPhase, weeksInPhase) {
  if (weeksInPhase <= 1) return 0;
  return Math.max(0, Math.min(1, (weekInPhase - 1) / (weeksInPhase - 1)));
}

function buildWeekPhaseSchedule(totalWeeks, claudePhases) {
  const blocks = claudePhases.map((p) => ({
    phase: normalizeTrainingPhase(p.name),
    // Claudes Freitext-Label ("Entwicklungsphase") wird verworfen: der Phasenname ist PHASE_LABEL_DE.
    label: trainingPhaseLabelDe(normalizeTrainingPhase(p.name)),
    focus: p.focus?.trim() || "",
    weeks: Math.max(1, Math.round(p.weeks)),
  }));

  const totalClaudeWeeks = blocks.reduce((sum, block) => sum + block.weeks, 0) || 1;
  const schedule = [];

  for (let weekIdx = 1; weekIdx <= totalWeeks; weekIdx += 1) {
    const claudePos = ((weekIdx - 0.5) / totalWeeks) * totalClaudeWeeks;
    let accumulated = 0;
    let block = blocks[blocks.length - 1];
    let weekInPhase = 1;

    for (const candidate of blocks) {
      if (claudePos <= accumulated + candidate.weeks) {
        block = candidate;
        weekInPhase = Math.max(1, Math.min(candidate.weeks, Math.ceil(claudePos - accumulated)));
        break;
      }
      accumulated += candidate.weeks;
    }

    schedule.push({
      phase: block.phase,
      label: block.label,
      focus: block.focus,
      weekInPhase,
      weeksInPhase: block.weeks,
    });
  }

  return schedule;
}

function getPhaseVolumeMultiplier(phase, weekInPhase, weeksInPhase, isRecoveryWeek) {
  const progress = getPhaseProgress01(weekInPhase, weeksInPhase);

  let base;
  switch (phase) {
    case "taper":
      base = 0.65 - progress * 0.35;
      break;
    case "peak":
      base = 1.05 + progress * 0.1;
      break;
    case "build":
      base = 0.92 + progress * 0.18;
      break;
    default:
      base = 0.78 + progress * 0.17;
      break;
  }

  if (isRecoveryWeek && phase !== "taper") {
    base *= 0.72;
  }

  return base;
}

function scaleRunningKm(km, combinedScale) {
  if (km <= 0 || combinedScale === 1) return km;
  return Math.round(km * combinedScale * 10) / 10;
}

function getWeekVolumeWave(weekNumber, dur) {
  if (dur <= 21) return 1;
  const cycleWeek = ((weekNumber - 1) % 4) + 1;
  switch (cycleWeek) {
    case 1:
      return 1.0;
    case 2:
      return 1.05;
    case 3:
      return 1.1;
    case 4:
      return 0.7;
    default:
      return 1;
  }
}

function isRecoveryWeekInWave(weekNumber, dur) {
  if (dur <= 21) return false;
  return ((weekNumber - 1) % 4) + 1 === 4;
}

function phaseAwareSessionType(dow, dur, aiRules, weekPhase) {
  if (aiRules) {
    const longRunDay = aiRules.longRunDay ?? 0;
    const intervalDay = aiRules.intervalDay ?? 2;
    const tempoDay = aiRules.tempoDay ?? 4;
    if (dow === longRunDay) return "long";
    if (dow === intervalDay) return "interval";
    if (dow === tempoDay) return "tempo";
    return "easy";
  }

  const phase = weekPhase ?? derivePhaseFromDur(dur);

  if (phase === "taper") {
    if (dow === 2) return "interval";
    if (dow === 0) return "long";
    return "easy";
  }
  if (phase === "peak") {
    if (dow === 2) return "interval";
    if (dow === 4) return "tempo";
    if (dow === 0) return "long";
    if (dow === 5) return "bike";
    return "easy";
  }

  const inBuild = phase === "build";
  if (dow === 2) return "interval";
  if (dow === 4) return inBuild ? "tempo" : "easy";
  if (dow === 0) return "long";
  if (dow === 5 && phase === "base") return "strength";
  if (dow === 6 && phase === "base") return "bike";
  return "easy";
}

function buildSessionMeta(sessionType, dur, weekNumber, sessionProgress01, finalScale, raceConfig, weekPhase) {
  let title = "";
  let km = 10;
  let pace = "locker";
  let descSuffix = "";

  const phase = weekPhase ?? derivePhaseFromDur(dur);

  if (phase === "taper") {
    if (sessionType === "interval") {
      km = scaleRunningKm(8 + Math.round(sessionProgress01 * 3), finalScale);
      pace = "frisch aber kurz";
    } else if (sessionType === "long") {
      km = scaleRunningKm(raceConfig.taperLongRunKm, finalScale);
      pace = "leicht locker";
    } else if (sessionType === "easy") {
      const base = dur <= 3 ? Math.max(5, 8 - (10 - dur)) : 10;
      km = scaleRunningKm(base, finalScale);
    } else {
      km = 0;
    }
    title = sessionType === "rest" ? "Ruhetag" : `${sessionType} (Taper) W${weekNumber}`;
    descSuffix = " Phase: Rennnah / Taper — Volumen runter.";
  } else if (phase === "peak") {
    if (sessionType === "bike" || sessionType === "rest") km = 0;
    else if (sessionType === "interval") {
      km = scaleRunningKm(12 + Math.round(sessionProgress01 * 6), finalScale);
    } else if (sessionType === "tempo") {
      km = scaleRunningKm(14 + Math.round(sessionProgress01 * 5), finalScale);
    } else if (sessionType === "long") {
      const baseLong = 14 + sessionProgress01 * (raceConfig.peakLongRunKm - 14);
      km = Math.min(raceConfig.peakLongRunKm, scaleRunningKm(Math.round(baseLong), finalScale));
    } else {
      km = scaleRunningKm(8 + Math.round(sessionProgress01 * 5), finalScale);
    }
    title =
      sessionType === "bike"
        ? "Rennrad optional"
        : sessionType === "rest"
          ? "Ruhetag"
          : sessionType === "long"
            ? `Long Run W${weekNumber}`
            : sessionType === "interval"
              ? "Intervall / Qualität"
              : sessionType === "tempo"
                ? "Schwellenbereich"
                : "Easy Run";
    descSuffix = " Phase: Wettkampfspezifikation / Peak-Stich.";
    pace =
      sessionType === "easy"
        ? "locker bis moderat"
        : sessionType === "interval"
          ? "je nach Block"
          : sessionType === "tempo"
            ? "„redet noch“ Schwelle"
            : sessionType === "long"
              ? "aerobe Grundlage"
              : "locker";
  } else {
    const inBuild = phase === "build";
    if (sessionType === "bike" || sessionType === "rest" || sessionType === "strength") km = 0;
    else if (sessionType === "interval") {
      km = scaleRunningKm(10 + Math.round(sessionProgress01 * 6), finalScale);
    } else if (sessionType === "tempo") {
      km = scaleRunningKm(12 + Math.round(sessionProgress01 * 5), finalScale);
    } else if (sessionType === "long") {
      const longBase = inBuild ? 12 : 10;
      const baseLong = longBase + sessionProgress01 * (raceConfig.peakLongRunKm - longBase);
      km = Math.min(raceConfig.peakLongRunKm, scaleRunningKm(Math.round(baseLong), finalScale));
    } else {
      km = scaleRunningKm(7 + Math.round(sessionProgress01 * 5), finalScale);
    }
    title =
      sessionType === "bike"
        ? "Rennrad Basics"
        : sessionType === "rest"
          ? "Ruhetag"
          : sessionType === "strength"
            ? "Krafttraining"
            : sessionType === "long"
              ? `Long Run W${weekNumber}`
              : sessionType === "interval"
                ? "Intervall"
                : sessionType === "tempo"
                  ? "Schwelle"
                  : "Easy Run";
    descSuffix = inBuild ? " Phase: Höhere Belastung / Peak." : " Phase: Basis & aerobe Entwicklung.";
  }

  return { title, km, pace, descSuffix };
}

function restWorkoutForDay(ymd, iso, desc = "Aktive Erholung oder komplette Pause.") {
  return {
    id: `coach-gen-${ymd}-rest`,
    dateIso: iso,
    sport: "rest",
    sessionType: "rest",
    title: "Ruhetag",
    km: 0,
    desc,
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function strengthWorkoutForDay(ymd, iso) {
  return {
    id: `coach-gen-${ymd}-strength`,
    dateIso: iso,
    sport: "rest",
    sessionType: "strength",
    title: "Krafttraining",
    km: 0,
    desc: "Rumpf, Beine, funktionelle Übungen.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function bikeWorkoutForDay(ymd, iso) {
  return {
    id: `coach-gen-${ymd}-bike`,
    dateIso: iso,
    sport: "bike",
    sessionType: "bike",
    title: "Radfahren",
    km: 0,
    desc: "Lockeres Radfahren, aktive Erholung.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function swimWorkoutForDay(ymd, iso) {
  return {
    id: `coach-gen-${ymd}-swim`,
    dateIso: iso,
    sport: "rest",
    sessionType: "swim",
    title: "Schwimmen",
    km: 0,
    desc: "Lockeres Schwimmen, Ganzkörper.",
    pace: null,
    structured: null,
    intensity: "low",
  };
}

function raceWorkoutForDay(ymd, iso, race, raceConfig) {
  return {
    id: `coach-gen-${ymd}-race`,
    dateIso: iso,
    sport: "run",
    sessionType: "race",
    title: raceConfig.raceTitle,
    km: raceConfig.raceKm,
    desc: `Renntermin ${formatDeDate(race)} — Ziel-/Taktiktempo passt sich deinem Fitnessstand an.`,
    pace: "Zielbereich unter Einstellungen / Prognosekarte nutzen.",
    structured: null,
    intensity: "high",
  };
}

function workoutForTrainingDay(
  day,
  race,
  weekNumber,
  progress01,
  volumeScale = 1,
  restDayDow,
  raceConfig = DEFAULT_RACE_CONFIG,
  weeklyKmScale = 1,
  aiRules,
  weekPhaseInfo,
) {
  const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const iso = new Date(`${ymd}T12:00:00`).toISOString();
  const dur = Math.max(0, Math.round((race.getTime() - day.getTime()) / 86400000));
  const dow = day.getDay();
  const combinedScale = volumeScale * weeklyKmScale;
  const ruleKmScale = aiRules?.weeklyKmMultiplier ?? aiRules?.volumeAdjustment ?? 1;
  const isRecoveryWeek = weekPhaseInfo
    ? isRecoveryWeekInWave(weekNumber, weekPhaseInfo.phase === "taper" ? 10 : 100)
    : isRecoveryWeekInWave(weekNumber, dur);
  const volumeWaveScale = weekPhaseInfo
    ? getPhaseVolumeMultiplier(
        weekPhaseInfo.phase,
        weekPhaseInfo.weekInPhase,
        weekPhaseInfo.weeksInPhase,
        isRecoveryWeek,
      )
    : getWeekVolumeWave(weekNumber, dur);
  const finalScale = combinedScale * ruleKmScale * volumeWaveScale;

  if (dur === 0) {
    return raceWorkoutForDay(ymd, iso, race, raceConfig);
  }

  if (aiRules) {
    const restDays = new Set(aiRules.restDays ?? []);
    if (restDays.has(dow)) {
      return restWorkoutForDay(ymd, iso);
    }
    if (aiRules.strengthDays?.includes(dow)) {
      return strengthWorkoutForDay(ymd, iso);
    }
    if (aiRules.bikeDays?.includes(dow)) {
      return bikeWorkoutForDay(ymd, iso);
    }
    if (aiRules.swimDays?.includes(dow)) {
      return swimWorkoutForDay(ymd, iso);
    }
    if (aiRules.crossTrainingDays?.includes(dow)) {
      return bikeWorkoutForDay(ymd, iso);
    }
  } else {
    const allRestDays = new Set();
    if (restDayDow !== undefined) {
      allRestDays.add(restDayDow);
    } else {
      raceConfig.restDaysPattern.forEach((d) => allRestDays.add(d));
    }
    if (allRestDays.has(dow)) {
      return restWorkoutForDay(ymd, iso);
    }
  }

  const sessionType = phaseAwareSessionType(dow, dur, aiRules, weekPhaseInfo?.phase);
  const sessionProgress01 = weekPhaseInfo
    ? getPhaseProgress01(weekPhaseInfo.weekInPhase, weekPhaseInfo.weeksInPhase)
    : progress01;
  const { title, km, pace, descSuffix } = buildSessionMeta(
    sessionType,
    dur,
    weekNumber,
    sessionProgress01,
    finalScale,
    raceConfig,
    weekPhaseInfo?.phase,
  );
  const desc = `Coach-Plan (${dur} Tage bis Rennen).${descSuffix}`;

  // Mindest-km für lockere Läufe (und damit Ruhetage bei zu wenig Wochenvolumen) legt
  // enforcePlanInvariants pro Woche fest, nicht das Mini-Volumen einer einzelnen Einheit.

  const sport = sportFor(sessionType);
  return {
    id: `coach-gen-${ymd}-${sessionType}`,
    dateIso: iso,
    sport,
    sessionType,
    title,
    km,
    desc,
    pace: sport === "rest" || sport === "bike" || sessionType === "strength" || sessionType === "rest" ? null : pace,
    structured: null,
    intensity: intensityFor(sessionType),
  };
}

function parseOnboardingRaceDate(text) {
  const trimmed = String(text ?? "").trim();
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1970) return null;

  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

function computeWeekStartDates(start, raceDay) {
  let s = startOfLocalDay(start);
  let r = startOfLocalDay(raceDay);
  if (r.getTime() < s.getTime()) {
    const t = r;
    r = s;
    s = t;
  }

  const firstWeekMon = mondayOfWeekContaining(s);
  const firstWeekMonIso = isoDateOf(firstWeekMon);
  const firstWeekStartIso = s.getDay() !== 1 ? isoDateOf(s) : firstWeekMonIso;
  const weekKeyOverrides =
    firstWeekStartIso !== firstWeekMonIso
      ? new Map([[firstWeekMonIso, firstWeekStartIso]])
      : undefined;

  const weekStarts = {};
  let weekIdx = 0;
  let lastWeekKey = "";
  const day = new Date(s);
  while (day.getTime() <= r.getTime()) {
    const mon = mondayOfWeekContaining(day);
    const monIso = isoDateOf(mon);
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      lastWeekKey = startIso;
      weekIdx += 1;
      weekStarts[weekIdx] = startIso;
    }
    day.setDate(day.getDate() + 1);
  }

  return { weekStarts, weekKeyOverrides, firstWeekStartIso, firstWeekMonIso, totalWeeks: weekIdx };
}

/**
 * Gemeinsamer Volumenkontext für beide Generatoren (Claude-Pfad und deterministischer Pfad):
 * Phasenplan mit festem Taper, Spitzenumfang, Ziel-km und Entlastungswochen je Woche.
 */
function buildVolumeContext({
  startDay,
  raceDay,
  structurePhases,
  raceDistanceKm,
  raceTargetTime,
  raceGoal,
  weeklyKmRange,
  longRunDow = 0,
  rules,
}) {
  const { totalWeeks } = computeWeekStartDates(startDay, raceDay);
  const weekDays = computeWeekDayCounts(startDay, raceDay);
  const volumeRef = getRecommendedVolume(raceDistanceKm, raceTargetTime, raceGoal);
  const taperWeeks = resolveTaperWeeks({
    distKey: volumeRef.distKey,
    totalWeeks,
    raceWeekDays: weekDays[totalWeeks - 1] ?? 7,
  });
  const phases = structurePhases?.length ? structurePhases : defaultStructureForWeeks(totalWeeks).phases;
  const weekPhaseSchedule = applyTaperToSchedule(buildWeekPhaseSchedule(totalWeeks, phases), taperWeeks);
  const weeklyTarget = parseWeeklyKmTarget(weeklyKmRange);
  const rangeMaxKm = parseWeeklyKmRangeMax(weeklyKmRange);
  const volumeGapWarning = weeklyTarget < volumeRef.baseKm[0] * 0.6;
  const effectivePeakKm = resolvePeakKm({
    referencePeakKm: volumeGapWarning ? Math.min(volumeRef.peakKm[1], weeklyTarget * 1.6) : volumeRef.peakKm[1],
    startWeeklyKm: weeklyTarget,
    rangeMaxKm,
  });
  // Die Woche mit dem längsten Lauf (letzter Long Run mindestens 14/21 Tage vor dem Rennen) bleibt ohne Entlastung.
  const startYmd = isoDateOf(startDay);
  const raceYmd = isoDateOf(raceDay);
  const firstMonday = ymdMondayOf(startYmd);
  const minDays = longRunMinDaysBeforeRace(volumeRef.distKey);
  let peakLongWeek = null;
  for (let w = 1; w <= totalWeeks; w += 1) {
    const longDate = ymdAddDays(firstMonday, (w - 1) * 7 + ((longRunDow + 6) % 7));
    if (longDate >= startYmd && ymdDiffDays(raceYmd, longDate) >= minDays) peakLongWeek = w;
  }

  // Folgepunkt (f): längster erlaubter Long Run je Woche und was die Lauftage damit tragen. Der Long Run wächst
  // linear bis zur Spitze (Referenz bzw. 22 % der Spitzenwoche) in der Woche des längsten Laufs und bleibt danach
  // dort. Er beginnt bei 65 % der Spitze, mindestens bei 30 % des aktuellen Umfangs, aber höchstens bei Spitze / 1,15
  // — sonst wäre die Kapazität jede Woche gleich und der Plan flach (I1/I2).
  const { runDays, hardDays } = runDaysFromRules(rules);
  const ultra = volumeRef.distKey === "ultra";
  const peakLongKm = ultra ? volumeRef.peakLongRunKm : Math.max(volumeRef.peakLongRunKm, 0.22 * effectivePeakKm);
  const startLongKm = Math.min(Math.max(0.65 * peakLongKm, 0.3 * weeklyTarget), peakLongKm / LONG_RUN_MIN_GROWTH_FOR_CAPACITY);
  const lastBuildWeek = peakLongWeek ?? Math.max(1, totalWeeks - taperWeeks);
  const longRunMaxKm = Array.from({ length: totalWeeks }, (_, i) => {
    const t = lastBuildWeek <= 1 ? 1 : Math.min(1, i / (lastBuildWeek - 1));
    return Math.round((startLongKm + (peakLongKm - startLongKm) * t) * 10) / 10;
  });
  const weekCapacity = longRunMaxKm.map((longMaxKm) =>
    weekCapacityKm({ runDays, hardDays, longMaxKm, raceKm: raceDistanceKm ?? 0 }),
  );

  const volumePlan = computeVolumePlan({
    totalWeeks,
    phaseSchedule: weekPhaseSchedule,
    startWeeklyKm: weeklyTarget,
    peakTargetKm: effectivePeakKm,
    weekDays,
    raceKm: raceDistanceKm ?? 0,
    protectedWeeks: peakLongWeek != null ? [peakLongWeek] : [],
    weekCapacityKm: weekCapacity,
  });
  const { targets: weeklyKmTargets, isDeload } = volumePlan;
  // Hinweis fürs Plan-Metadatum: die 10-%-Grenze bzw. die Lauftage gehen vor der Spitze.
  const volumeNote = volumePlan.peakReached
    ? null
    : {
        code: "peak-not-reached",
        reason: volumePlan.peakLimit,
        targetPeakKm: effectivePeakKm,
        reachedPeakKm: volumePlan.reachedPeakKm,
      };
  return {
    totalWeeks,
    weekDays,
    volumeRef,
    taperWeeks,
    weekPhaseSchedule,
    weeklyTarget,
    rangeMaxKm,
    volumeGapWarning,
    effectivePeakKm,
    reachedPeakKm: volumePlan.reachedPeakKm,
    weeklyKmTargets,
    isDeload,
    runDays,
    hardDays,
    longRunMaxKm,
    weekCapacityKm: weekCapacity,
    volumeNote,
  };
}

/** Anzahl Plantage (Start bis Renntag, jeweils inklusive) pro Plan-Woche; Index = Wochennummer - 1. */
function computeWeekDayCounts(start, raceDay) {
  const { weekKeyOverrides } = computeWeekStartDates(start, raceDay);
  let s = startOfLocalDay(start);
  let r = startOfLocalDay(raceDay);
  if (r.getTime() < s.getTime()) {
    const t = r;
    r = s;
    s = t;
  }
  const counts = [];
  let lastWeekKey = "";
  const day = new Date(s);
  while (day.getTime() <= r.getTime()) {
    const monIso = isoDateOf(mondayOfWeekContaining(day));
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      lastWeekKey = startIso;
      counts.push(0);
    }
    counts[counts.length - 1] += 1;
    day.setDate(day.getDate() + 1);
  }
  return counts;
}

function generateMarathonPlanV2ToRace(
  start,
  raceDay,
  goal,
  raceDistanceKm,
  weeklyKmRange,
  restDayDow,
  aiRules,
  claudePhases,
  raceTargetTime,
) {
  const volumeScale = goal === "finish" ? 0.8 : 1;
  const raceConfig = getRaceConfig(raceDistanceKm, goal ?? "time");
  const weeklyKmTarget = parseWeeklyKmTarget(weeklyKmRange);
  const baselineKmTarget = 50;
  const weeklyKmScale = weeklyKmTarget / baselineKmTarget;

  let s = startOfLocalDay(start);
  let r = startOfLocalDay(raceDay);
  if (r.getTime() < s.getTime()) {
    const t = r;
    r = s;
    s = t;
  }
  const totalDays = Math.round((r.getTime() - s.getTime()) / 86400000) + 1;

  const workouts = [];
  const metaByWeekStart = new Map();

  const firstWeekMon = mondayOfWeekContaining(s);
  const firstWeekMonIso = isoDateOf(firstWeekMon);
  const firstWeekStartIso = s.getDay() !== 1 ? isoDateOf(s) : firstWeekMonIso;
  const weekKeyOverrides =
    firstWeekStartIso !== firstWeekMonIso
      ? new Map([[firstWeekMonIso, firstWeekStartIso]])
      : undefined;

  const totalWeeks = countWeeksInPlan(s, r, weekKeyOverrides);
  const volumeContext = buildVolumeContext({
    startDay: s,
    raceDay: r,
    structurePhases: claudePhases,
    raceDistanceKm: raceDistanceKm ?? raceConfig.raceKm,
    raceTargetTime,
    raceGoal: goal ?? "time",
    weeklyKmRange,
    longRunDow: aiRules?.longRunDay ?? 0,
    rules: aiRules,
  });
  const weekPhaseSchedule = totalWeeks > 0 ? volumeContext.weekPhaseSchedule : null;

  const day = new Date(s);
  let weekIdx = 0;
  let lastWeekKey = "";
  let currentWeekPhaseInfo;
  while (day.getTime() <= r.getTime()) {
    const dur = Math.round((r.getTime() - day.getTime()) / 86400000);
    const progress01 = totalDays > 1 ? 1 - dur / (totalDays - 1) : 1;

    const mon = mondayOfWeekContaining(day);
    const monIso = isoDateOf(mon);
    const startIso = weekKeyOverrides?.get(monIso) ?? monIso;
    if (startIso !== lastWeekKey) {
      lastWeekKey = startIso;
      weekIdx += 1;
      currentWeekPhaseInfo = weekPhaseSchedule?.[weekIdx - 1];

      let phase = currentWeekPhaseInfo?.phase ?? "base";
      let focus = currentWeekPhaseInfo?.focus || "Basis-/Aufbau";
      if (!currentWeekPhaseInfo) {
        const midDur = dur - 3;
        if (midDur <= 10) phase = "taper";
        else if (midDur <= 21) phase = "peak";
        else if (midDur <= 56) phase = "build";

        if (dur <= 10) focus = "Renn-/Taper-Phase — frisch sein";
        else if (dur <= 28) focus = "Spezifikation & längere Reize kontrolliert";
        else if (dur <= 56) focus = "Aufbau/Peak nach Verfügbarkeit";
        else focus = "Aerobe Basis schaffen";
      }

      const isRecoveryWeek = volumeContext.isDeload[weekIdx - 1] === true;
      const displayDate =
        startIso === firstWeekStartIso && firstWeekStartIso !== firstWeekMonIso ? s : mon;

      metaByWeekStart.set(startIso, {
        wn: weekIdx,
        phase,
        label: weekLabelFor(weekIdx, phase),
        dates: `${formatDeDate(displayDate)} ff.`,
        focus: isRecoveryWeek ? RECOVERY_WEEK_FOCUS : focus,
        isRecoveryWeek,
      });
    }

    workouts.push(
      workoutForTrainingDay(
        new Date(day),
        r,
        weekIdx,
        progress01,
        volumeScale,
        restDayDow,
        raceConfig,
        weeklyKmScale,
        aiRules,
        currentWeekPhaseInfo,
      ),
    );
    day.setDate(day.getDate() + 1);
  }

  const enforcedWorkouts = enforcePlanInvariants(workouts, {
    startYmd: isoDateOf(s),
    raceYmd: isoDateOf(r),
    raceKm: raceDistanceKm ?? raceConfig.raceKm,
    raceTitle: raceConfig.raceTitle,
    distKey: volumeContext.volumeRef.distKey,
    weeklyKmTargets: volumeContext.weeklyKmTargets,
    isDeload: volumeContext.isDeload,
    weekPhaseSchedule: volumeContext.weekPhaseSchedule,
    peakLongRunKm: volumeContext.volumeRef.peakLongRunKm,
    longRunMaxKm: volumeContext.longRunMaxKm,
    longRunDow: aiRules?.longRunDay ?? 0,
    restDows: Array.isArray(aiRules?.restDays)
      ? aiRules.restDays
      : restDayDow !== undefined
        ? [restDayDow]
        : raceConfig.restDaysPattern,
  });

  return withPlanMeta(rebuildPlanFromWorkouts(enforcedWorkouts, metaByWeekStart, weekKeyOverrides), volumeContext);
}

/** Plan-Metadatum: Hinweis, wenn die Spitze wegen der 10-%-Grenze oder der Lauftage nicht erreicht wird. */
function withPlanMeta(plan, volumeContext) {
  return volumeContext.volumeNote ? { ...plan, meta: { volumeNote: volumeContext.volumeNote } } : plan;
}

function extractWorkoutsForPhase(fullPlan, weekPhaseSchedule, phaseName) {
  const normalizedPhase = normalizeTrainingPhase(phaseName);
  const targetWns = new Set();
  weekPhaseSchedule.forEach((info, i) => {
    if (info.phase === normalizedPhase) targetWns.add(i + 1);
  });

  const workouts = [];
  for (const week of fullPlan.weeks ?? []) {
    if (targetWns.has(week.meta?.wn)) {
      workouts.push(...week.workouts);
    }
  }
  return workouts;
}

function defaultStructureForWeeks(totalWeeks) {
  const taper = Math.max(2, Math.round(totalWeeks * 0.15));
  const peak = Math.max(1, Math.round(totalWeeks * 0.12));
  const build = Math.max(2, Math.round(totalWeeks * 0.38));
  const base = Math.max(1, totalWeeks - taper - peak - build);
  return {
    phases: [
      { name: "base", weeks: base, label: "Grundlagenblock", focus: "Aerobe Basis aufbauen" },
      { name: "build", weeks: build, label: "Entwicklungsphase", focus: "Volumen und Intensität steigern" },
      { name: "peak", weeks: peak, label: "Spezifische Vorbereitung", focus: "Rennspezifische Reize setzen" },
      { name: "taper", weeks: taper, label: "Tapering", focus: "Erholen und schärfen" },
    ],
    rules: {
      restDays: [1],
      longRunDay: 0,
      intervalDay: 2,
      tempoDay: 4,
      bikeDays: [],
      swimDays: [],
      strengthDays: [],
      maxTrainingDaysPerWeek: 5,
      weeklyKmMultiplier: 1.0,
      recoveryWeekEvery: 4,
    },
  };
}

function getWeekTotalKmFromPlan(fullPlan, weekNumber) {
  for (const week of fullPlan.weeks ?? []) {
    if (week.meta?.wn === weekNumber) {
      return Math.round((week.totalKm ?? 0) * 10) / 10;
    }
  }
  return null;
}

module.exports = {
  normalizeTrainingPhase,
  trainingPhaseLabelDe,
  weekLabelFor,
  RECOVERY_WEEK_FOCUS,
  PHASE_LABEL_DE,
  parseWeeklyKmTarget,
  parseWeeklyKmRangeMax,
  runDaysFromRules,
  withPlanMeta,
  parseOnboardingRaceDate,
  buildWeekPhaseSchedule,
  computeWeekStartDates,
  computeWeekDayCounts,
  buildVolumeContext,
  generateMarathonPlanV2ToRace,
  extractWorkoutsForPhase,
  getWeekTotalKmFromPlan,
  defaultStructureForWeeks,
  formatDeDate,
  isoDateOf,
};
