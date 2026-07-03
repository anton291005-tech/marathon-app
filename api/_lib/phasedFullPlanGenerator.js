"use strict";

const { generatePlanStructureWithClaude } = require("./claudePlanGenerator");
const {
  normalizeTrainingPhase,
  parseWeeklyKmTarget,
  parseOnboardingRaceDate,
  buildWeekPhaseSchedule,
  computeWeekStartDates,
  generateMarathonPlanV2ToRace,
  extractWorkoutsForPhase,
  getWeekTotalKmFromPlan,
  defaultStructureForWeeks,
  formatDeDate,
} = require("./deterministicPlanGenerator");
const {
  normalizeWorkouts,
  rebuildPlanFromWorkouts,
  parseClaudeJson,
  getPreviousPhaseSummary,
  scalePhaseWorkoutsForContinuity,
  groupWorkoutsByWeekStart,
  sumWeekKm,
} = require("./planWorkoutUtils");

const PHASE_ORDER = ["base", "build", "peak", "taper"];
const PHASE_MAX_TOKENS = 4000;
const PHASE_CALL_TIMEOUT_MS = 90000;

function buildPhaseSystemPrompt(phaseName) {
  const phaseUpper = phaseName.toUpperCase();
  return `Du bist ein erfahrener Marathontrainer. Generiere NUR den Tages-für-Tages-Trainingsplan für die ${phaseUpper}-Phase als JSON.

Gib NUR gültiges JSON zurück, kein Markdown, keine Erklärungen.

SCHEMA (exakt einhalten):
{
  "weeks": [
    { "id": "w5", "label": "Woche 5", "phase": "${phaseUpper}", "startIso": "YYYY-MM-DD", "totalKm": 45 }
  ],
  "workouts": [
    {
      "id": "w5-mo", "weekId": "w5", "day": "Mo", "date": "28. Jun",
      "type": "easy", "title": "Lockerer Dauerlauf", "km": 8,
      "description": "GA1-Bereich, Herzfrequenz niedrig halten.", "phase": "${phaseUpper}"
    }
  ]
}

WICHTIG — NUR DIESE PHASE:
- Generiere ausschließlich die Wochen die im User-Prompt genannt sind
- Verwende die GLOBALEN Wochennummern (w{n}) aus dem Prompt — z.B. w5-mo, nicht w1-mo
- Alle 7 Wochentage pro Woche (Mo-So), kein Tag auslassen
- day: Mo, Di, Mi, Do, Fr, Sa, So
- date: "28. Jun" Format (kein Jahr)
- startIso: ISO-Datum des Montags der jeweiligen Woche
- type: easy | tempo | interval | long | race | rest | bike | strength
- Renntag nur in Taper-Phase am Renndatum: type "race", km = Renndistanz
- Ruhetage: type "rest", km: 0

VOLUMEN (KRITISCH):
- Wochenvolumen MUSS zum Athleten-Niveau passen (weeklyKmRange aus User-Prompt)
- Steigerung max. 10% gegenüber Vorwoche / vorheriger Phase
- Jede 4. Woche: Entlastungswoche (-25 bis -30% Volumen)
- totalKm in weeks[] muss zur Summe der Lauf-km passen

EINHEITEN-ROTATION:
- Intervalle, Tempo, Long Runs und Easy Runs variieren — keine repetitiven Wochen
- Beschreibungen konkret mit Pace/Struktur
- Titel ohne Wochennummern, beschreibend und abwechslungsreich`;
}

function buildPhaseUserMessage(profile, phaseSpec, context) {
  const prefs = profile.userPreferences ?? [];
  const prefsText = prefs.length > 0
    ? prefs.map((p, i) => `${i + 1}. "${p}"`).join("\n")
    : "Keine besonderen Präferenzen.";

  const km = profile.raceDistanceKm ?? 42.2;
  const isTimeGoal = profile.raceGoal !== "finish";
  const goalText = isTimeGoal
    ? `Zeitziel: ${profile.raceTargetTime}`
    : "Ziel: Finisher — Fokus auf Ausdauer";
  const weeklyTarget = parseWeeklyKmTarget(profile.weeklyKmRange);

  const weekLines = context.phaseWeekNumbers
    .map((wn) => {
      const startIso = context.weekStarts[wn];
      const startDate = startIso ? new Date(`${startIso}T12:00:00`) : null;
      const dateLabel = startDate ? formatDeDate(startDate) : startIso;
      const info = context.weekPhaseSchedule[wn - 1];
      return `- Woche ${wn} (global w${wn}): startIso=${startIso}, ab ${dateLabel}, Woche ${info.weekInPhase}/${info.weeksInPhase} in ${phaseSpec.name.toUpperCase()}`;
    })
    .join("\n");

  const prevSummaryText = context.previousPhaseSummary
    ? `VORHERIGE PHASE endete mit ${context.previousPhaseSummary.lastWeekTotalKm} km Gesamtvolumen in der letzten Woche (Ende: ${context.previousPhaseSummary.lastWeekEndIso ?? context.previousPhaseSummary.lastWeekStartIso}) — baue progressiv darauf auf (+max 10%).`
    : "Dies ist die erste Phase — starte beim Athleten-Niveau (weeklyKmRange), nicht darüber.";

  const rules = context.rules ?? {};
  const rulesText = JSON.stringify(rules, null, 2);

  return `Generiere den Tagesplan NUR für die ${phaseSpec.name.toUpperCase()}-Phase.

ATHLET:
- Renndistanz: ${profile.raceDistanceLabel} (${km} km)
- Aktuelles Niveau: ${profile.weeklyKmRange} km/Woche (Ziel-Mittelwert ~${weeklyTarget} km/Woche)
- ${goalText}
- Planstart: ${profile.planStartDate}
- Renndatum: ${profile.raceDate}

PHASE:
- Name: ${phaseSpec.name}
- Label: ${phaseSpec.label}
- Focus: ${phaseSpec.focus}
- Anzahl Wochen in dieser Phase: ${context.phaseWeekNumbers.length}
- Erste globale Wochennummer: ${context.startWeekIndex}

WOCHEN DIE DU GENERIEREN SOLLST (GLOBALE NUMMERIERUNG):
${weekLines}

${prevSummaryText}

GLOBALE TRAININGSREGELN (strikt einhalten):
${rulesText}

PERSÖNLICHE WÜNSCHE:
${prefsText}

Gib NUR das JSON zurück — weeks + workouts für diese Phase, mit globalen w{n}-IDs.`;
}

function getPhaseWeekNumbers(weekPhaseSchedule, phaseName) {
  const normalized = normalizeTrainingPhase(phaseName);
  const weeks = [];
  weekPhaseSchedule.forEach((info, idx) => {
    if (info.phase === normalized) weeks.push(idx + 1);
  });
  return weeks;
}

function orderPhases(structurePhases) {
  const byName = new Map();
  for (const phase of structurePhases ?? []) {
    byName.set(normalizeTrainingPhase(phase.name), phase);
  }
  const ordered = [];
  for (const name of PHASE_ORDER) {
    if (byName.has(name)) ordered.push(byName.get(name));
  }
  for (const phase of structurePhases ?? []) {
    const name = normalizeTrainingPhase(phase.name);
    if (!PHASE_ORDER.includes(name) && !ordered.includes(phase)) {
      ordered.push(phase);
    }
  }
  return ordered;
}

async function callClaudeForPhase(client, profile, phaseSpec, context) {
  const systemPrompt = buildPhaseSystemPrompt(normalizeTrainingPhase(phaseSpec.name));
  const userMessage = buildPhaseUserMessage(profile, phaseSpec, context);

  const message = await Promise.race([
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: PHASE_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Claude phase timeout")), PHASE_CALL_TIMEOUT_MS),
    ),
  ]);

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { text, responseLength: text.length };
}

async function generateFullPlanByPhases(client, profile) {
  const planStartTs = Date.now();
  console.log(`[phased-plan] START ts=${planStartTs}`);

  const startDay = parseOnboardingRaceDate(profile.planStartDate);
  const raceDay = parseOnboardingRaceDate(profile.raceDate);
  if (!startDay || !raceDay) {
    throw new Error("Invalid planStartDate or raceDate");
  }

  console.log("[phased-plan] fetching structure...");
  let structure = await generatePlanStructureWithClaude(profile);
  const { weekStarts, weekKeyOverrides, totalWeeks } = computeWeekStartDates(startDay, raceDay);

  if (!structure?.phases?.length) {
    console.warn("[phased-plan] structure missing — using default phases");
    structure = defaultStructureForWeeks(totalWeeks);
  }

  const rules = structure.rules ?? defaultStructureForWeeks(totalWeeks).rules;
  const weekPhaseSchedule = buildWeekPhaseSchedule(totalWeeks, structure.phases);
  const orderedPhases = orderPhases(structure.phases);

  console.log("[phased-plan] totalWeeks:", totalWeeks, "phases:", orderedPhases.map((p) => p.name).join(", "));

  let deterministicFallbackPlan = null;
  const getDeterministicPlan = () => {
    if (!deterministicFallbackPlan) {
      deterministicFallbackPlan = generateMarathonPlanV2ToRace(
        startDay,
        raceDay,
        profile.raceGoal,
        profile.raceDistanceKm,
        profile.weeklyKmRange,
        undefined,
        rules,
        structure.phases,
      );
    }
    return deterministicFallbackPlan;
  };

  const allWorkouts = [];
  const phaseDiagnostics = [];

  for (const phaseSpec of orderedPhases) {
    const phaseName = normalizeTrainingPhase(phaseSpec.name);
    const phaseWeekNumbers = getPhaseWeekNumbers(weekPhaseSchedule, phaseName);
    if (phaseWeekNumbers.length === 0) {
      console.log(`[phased-plan] phase ${phaseName}: skipped (0 weeks)`);
      phaseDiagnostics.push({ phase: phaseName, status: "skipped", reason: "no weeks mapped" });
      continue;
    }

    const phaseStartTs = Date.now();
    const startWeekIndex = phaseWeekNumbers[0];
    // Always derive from workouts actually generated so far (Claude or fallback).
    const previousPhaseSummary = getPreviousPhaseSummary(allWorkouts);
    const context = {
      rules,
      weekStarts,
      weekPhaseSchedule,
      phaseWeekNumbers,
      startWeekIndex,
      previousPhaseSummary,
    };

    let status = "claude";
    let responseLength = 0;
    let errorMessage = null;
    let continuityScale = null;
    let phaseWorkouts = [];

    console.log(
      `[phased-plan] phase ${phaseName}: START ts=${phaseStartTs} weeks=${phaseWeekNumbers.join(",")} startWeek=${startWeekIndex}` +
        (previousPhaseSummary
          ? ` prevWeekKm=${previousPhaseSummary.lastWeekTotalKm} prevWeekEnd=${previousPhaseSummary.lastWeekEndIso}`
          : ""),
    );

    try {
      const { text, responseLength: len } = await callClaudeForPhase(client, profile, phaseSpec, context);
      responseLength = len;
      const parsed = parseClaudeJson(text);
      phaseWorkouts = normalizeWorkouts(parsed, profile).filter((w) => w.dateIso);
      if (phaseWorkouts.length === 0) {
        throw new Error("no valid workouts after parse");
      }
    } catch (err) {
      status = "fallback";
      errorMessage = err?.message ?? "unknown";
      console.warn(
        `[phased-plan] phase ${phaseName}: Claude failed (${errorMessage}), using deterministic fallback`,
      );

      const deterministicPlan = getDeterministicPlan();
      const transitionWeek = startWeekIndex > 1 ? startWeekIndex - 1 : null;
      const deterministicReferenceKm =
        transitionWeek != null ? getWeekTotalKmFromPlan(deterministicPlan, transitionWeek) : null;

      const rawFallback = extractWorkoutsForPhase(deterministicPlan, weekPhaseSchedule, phaseName);
      phaseWorkouts = scalePhaseWorkoutsForContinuity(
        rawFallback,
        previousPhaseSummary,
        deterministicReferenceKm,
      );

      if (previousPhaseSummary && rawFallback.length > 0) {
        const rawWeeks = groupWorkoutsByWeekStart(rawFallback);
        const adjWeeks = groupWorkoutsByWeekStart(phaseWorkouts);
        const rawFirstWeekKm = rawWeeks.length > 0 ? sumWeekKm(rawWeeks[0][1]) : 0;
        const adjustedFirstWeekKm = adjWeeks.length > 0 ? sumWeekKm(adjWeeks[0][1]) : 0;
        if (rawFirstWeekKm > 0 && adjustedFirstWeekKm > 0) {
          continuityScale = Math.round((adjustedFirstWeekKm / rawFirstWeekKm) * 100) / 100;
        }
        console.log(
          `[phased-plan] phase ${phaseName}: fallback continuity` +
            ` prevActualKm=${previousPhaseSummary.lastWeekTotalKm}` +
            ` detRefKm=${deterministicReferenceKm ?? "n/a"}` +
            ` scale=${continuityScale ?? 1}`,
        );
      }
    }

    const phaseEndTs = Date.now();
    const phaseDurationMs = phaseEndTs - phaseStartTs;
    console.log(
      `[phased-plan] phase ${phaseName}: END ts=${phaseEndTs} durationMs=${phaseDurationMs} status=${status}` +
        ` workouts=${phaseWorkouts.length} responseLength=${responseLength}`,
    );

    allWorkouts.push(...phaseWorkouts);
    phaseDiagnostics.push({
      phase: phaseName,
      status,
      responseLength,
      workoutCount: phaseWorkouts.length,
      weekNumbers: phaseWeekNumbers,
      error: errorMessage,
      durationMs: phaseDurationMs,
      continuityScale,
      previousPhaseSummary: previousPhaseSummary
        ? {
            lastWeekTotalKm: previousPhaseSummary.lastWeekTotalKm,
            lastWeekEndIso: previousPhaseSummary.lastWeekEndIso,
          }
        : null,
    });
  }

  if (allWorkouts.length === 0) {
    throw new Error("No workouts generated for any phase");
  }

  const plan = rebuildPlanFromWorkouts(allWorkouts, undefined, weekKeyOverrides);
  const totalDurationMs = Date.now() - planStartTs;
  console.log(
    `[phased-plan] END ts=${Date.now()} totalDurationMs=${totalDurationMs}` +
      (totalDurationMs > 180000 ? " WARNING: total duration exceeds 3 minutes" : ""),
  );
  console.log(
    "[phased-plan] merged plan:",
    "workouts=",
    plan.workouts?.length ?? 0,
    "weeks=",
    plan.weeks?.length ?? 0,
    "diagnostics=",
    JSON.stringify(phaseDiagnostics),
  );

  return { plan, diagnostics: phaseDiagnostics, totalDurationMs };
}

module.exports = { generateFullPlanByPhases };
