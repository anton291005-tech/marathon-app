"use strict";

const { generatePlanStructureWithClaude } = require("./claudePlanGenerator");
const {
  normalizeTrainingPhase,
  parseWeeklyKmTarget,
  parseOnboardingRaceDate,
  buildWeekPhaseSchedule,
  computeWeekStartDates,
  generateMarathonPlanV2ToRace,
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
const TOKENS_PER_WEEK = 1100;
const BASE_OVERHEAD = 600;
const MAX_TOKENS_CAP = 8192;
const PHASE_CALL_TIMEOUT_MS = 90000;

function calculateMaxTokensForPhase(weekCount) {
  const calculated = BASE_OVERHEAD + weekCount * TOKENS_PER_WEEK;
  return Math.min(calculated, MAX_TOKENS_CAP);
}

function splitWeekNumbersIntoChunks(weekNumbers, maxWeeksPerCall) {
  const chunks = [];
  for (let i = 0; i < weekNumbers.length; i += maxWeeksPerCall) {
    chunks.push(weekNumbers.slice(i, i + maxWeeksPerCall));
  }
  return chunks;
}

function extractWorkoutsForWeekNumbers(fullPlan, weekNumbers) {
  const targetWns = new Set(weekNumbers);
  const workouts = [];
  for (const week of fullPlan.weeks ?? []) {
    if (targetWns.has(week.meta?.wn)) {
      workouts.push(...week.workouts);
    }
  }
  return workouts;
}

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

async function callClaudeForPhase(client, profile, phaseSpec, context, maxTokens) {
  const systemPrompt = buildPhaseSystemPrompt(normalizeTrainingPhase(phaseSpec.name));
  const userMessage = buildPhaseUserMessage(profile, phaseSpec, context);

  const message = await Promise.race([
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
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
  process.stdout.write(`[phased-plan] REQUEST START ${new Date().toISOString()}\n`);
  const planStartTs = Date.now();
  process.stdout.write(`[phased-plan] START ${JSON.stringify({ ts: planStartTs })}\n`);

  const startDay = parseOnboardingRaceDate(profile.planStartDate);
  const raceDay = parseOnboardingRaceDate(profile.raceDate);
  if (!startDay || !raceDay) {
    throw new Error("Invalid planStartDate or raceDate");
  }

  process.stdout.write(`[phased-plan] fetching structure ${JSON.stringify({})}\n`);
  process.stdout.write(`[phased-plan] PHASE STRUCTURE START ${new Date().toISOString()}\n`);
  let structure = await generatePlanStructureWithClaude(profile);
  process.stdout.write(`[phased-plan] PHASE STRUCTURE DONE ${new Date().toISOString()}\n`);
  const { weekStarts, weekKeyOverrides, totalWeeks } = computeWeekStartDates(startDay, raceDay);

  if (!structure?.phases?.length) {
    console.warn("[phased-plan] structure missing — using default phases");
    structure = defaultStructureForWeeks(totalWeeks);
  }

  const rules = structure.rules ?? defaultStructureForWeeks(totalWeeks).rules;
  const weekPhaseSchedule = buildWeekPhaseSchedule(totalWeeks, structure.phases);
  const orderedPhases = orderPhases(structure.phases);

  process.stdout.write(
    `[phased-plan] totalWeeks ${JSON.stringify({ totalWeeks, phases: orderedPhases.map((p) => p.name) })}\n`,
  );

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
      process.stdout.write(
        `[phased-plan] phase skipped ${JSON.stringify({ phase: phaseName, reason: "0 weeks" })}\n`,
      );
      phaseDiagnostics.push({ phase: phaseName, status: "skipped", reason: "no weeks mapped" });
      continue;
    }

    const phaseNum = PHASE_ORDER.indexOf(phaseName) + 1;
    const phaseStartTs = Date.now();
    const startWeekIndex = phaseWeekNumbers[0];
    // Always derive from workouts actually generated so far (Claude or fallback).
    const previousPhaseSummary = getPreviousPhaseSummary(allWorkouts);

    let status = "claude";
    let responseLength = 0;
    let errorMessage = null;
    let continuityScale = null;
    let phaseWorkouts = [];

    process.stdout.write(
      `[phased-plan] phase START ${JSON.stringify({
        phase: phaseName,
        phaseNum,
        ts: phaseStartTs,
        weeks: phaseWeekNumbers,
        startWeek: startWeekIndex,
        prevWeekKm: previousPhaseSummary?.lastWeekTotalKm ?? null,
        prevWeekEnd: previousPhaseSummary?.lastWeekEndIso ?? null,
      })}\n`,
    );

    process.stdout.write(`[phased-plan] PHASE ${phaseNum} START ${new Date().toISOString()}\n`);
    const maxWeeksPerCall = Math.floor((MAX_TOKENS_CAP - BASE_OVERHEAD) / TOKENS_PER_WEEK);
    const phaseChunks =
      phaseWeekNumbers.length <= maxWeeksPerCall
        ? [phaseWeekNumbers]
        : splitWeekNumbersIntoChunks(phaseWeekNumbers, maxWeeksPerCall);
    const totalChunks = phaseChunks.length;
    let chunkPreviousSummary = previousPhaseSummary;

    for (let chunkIndex = 0; chunkIndex < phaseChunks.length; chunkIndex++) {
      const chunkWeekNumbers = phaseChunks[chunkIndex];
      const chunkNum = chunkIndex + 1;
      const maxTokens = calculateMaxTokensForPhase(chunkWeekNumbers.length);
      process.stdout.write(
        `[phased-plan] PHASE ${phaseNum} CHUNK ${chunkNum}/${totalChunks} weeks: ${chunkWeekNumbers.length}, max_tokens: ${maxTokens}\n`,
      );

      const chunkContext = {
        rules,
        weekStarts,
        weekPhaseSchedule,
        phaseWeekNumbers: chunkWeekNumbers,
        startWeekIndex: chunkWeekNumbers[0],
        previousPhaseSummary: chunkPreviousSummary,
      };

      let rawResponseText = "";
      try {
        const { text, responseLength: len } = await callClaudeForPhase(
          client,
          profile,
          phaseSpec,
          chunkContext,
          maxTokens,
        );
        rawResponseText = text;
        responseLength += len;
        const parsed = parseClaudeJson(text);
        const chunkWorkouts = normalizeWorkouts(parsed, profile).filter((w) => w.dateIso);
        if (chunkWorkouts.length === 0) {
          throw new Error("no valid workouts after parse");
        }
        phaseWorkouts.push(...chunkWorkouts);
      } catch (err) {
        const errorPos = parseInt(err.message.match(/position (\d+)/)?.[1] || "0", 10);
        const snippet = rawResponseText.slice(Math.max(0, errorPos - 150), errorPos + 150);
        process.stdout.write(`[phased-plan] PARSE ERROR CONTEXT: ${JSON.stringify(snippet)}\n`);
        status = "fallback";
        errorMessage = err?.message ?? "unknown";
        console.warn(
          `[phased-plan] phase ${phaseName} chunk ${chunkNum}/${totalChunks}: Claude failed (${errorMessage}), using deterministic fallback`,
        );

        const deterministicPlan = getDeterministicPlan();
        const chunkStartWeek = chunkWeekNumbers[0];
        const transitionWeek = chunkStartWeek > 1 ? chunkStartWeek - 1 : null;
        const deterministicReferenceKm =
          transitionWeek != null ? getWeekTotalKmFromPlan(deterministicPlan, transitionWeek) : null;

        const rawFallback = extractWorkoutsForWeekNumbers(deterministicPlan, chunkWeekNumbers);
        const chunkWorkouts = scalePhaseWorkoutsForContinuity(
          rawFallback,
          chunkPreviousSummary,
          deterministicReferenceKm,
        );

        if (chunkPreviousSummary) {
          process.stdout.write(`[phased-plan] PHASE ${phaseNum} FALLBACK USED\n`);
        }

        if (chunkPreviousSummary && rawFallback.length > 0) {
          const rawWeeks = groupWorkoutsByWeekStart(rawFallback);
          const adjWeeks = groupWorkoutsByWeekStart(chunkWorkouts);
          const rawFirstWeekKm = rawWeeks.length > 0 ? sumWeekKm(rawWeeks[0][1]) : 0;
          const adjustedFirstWeekKm = adjWeeks.length > 0 ? sumWeekKm(adjWeeks[0][1]) : 0;
          if (rawFirstWeekKm > 0 && adjustedFirstWeekKm > 0) {
            continuityScale = Math.round((adjustedFirstWeekKm / rawFirstWeekKm) * 100) / 100;
          }
          process.stdout.write(
            `[phased-plan] fallback continuity ${JSON.stringify({
              phase: phaseName,
              chunk: `${chunkNum}/${totalChunks}`,
              prevActualKm: chunkPreviousSummary.lastWeekTotalKm,
              detRefKm: deterministicReferenceKm ?? "n/a",
              scale: continuityScale ?? 1,
            })}\n`,
          );
        }

        phaseWorkouts.push(...chunkWorkouts);
      }

      chunkPreviousSummary = getPreviousPhaseSummary(phaseWorkouts);
    }
    process.stdout.write(`[phased-plan] PHASE ${phaseNum} DONE ${new Date().toISOString()}\n`);

    const phaseEndTs = Date.now();
    const phaseDurationMs = phaseEndTs - phaseStartTs;
    process.stdout.write(
      `[phased-plan] phase END ${JSON.stringify({
        phase: phaseName,
        ts: phaseEndTs,
        durationMs: phaseDurationMs,
        status,
        workouts: phaseWorkouts.length,
        responseLength,
      })}\n`,
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
  process.stdout.write(
    `[phased-plan] END ${JSON.stringify({
      ts: Date.now(),
      totalDurationMs,
      warning: totalDurationMs > 180000 ? "total duration exceeds 3 minutes" : null,
    })}\n`,
  );
  process.stdout.write(
    `[phased-plan] merged plan ${JSON.stringify({
      workouts: plan.workouts?.length ?? 0,
      weeks: plan.weeks?.length ?? 0,
      diagnostics: phaseDiagnostics,
    })}\n`,
  );

  process.stdout.write(`[phased-plan] REQUEST DONE ${new Date().toISOString()}\n`);
  return { plan, diagnostics: phaseDiagnostics, totalDurationMs };
}

module.exports = { generateFullPlanByPhases };
