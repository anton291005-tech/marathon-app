/**
 * Deterministic NL → coach response for supported scenarios (runs before remote LLM).
 */
import { computePlanAdherenceScore } from "../../coach/adherenceScore";
import {
  computeTrainableWholePlanProgressPct,
  flattenTrainableSessionsFromPlan,
} from "../../lib/training/progressCalculation";
import { validateTrainingPlanV2Integrity } from "../../ai/validation/validateTrainingPlanV2Integrity";
import type { StoredHealthRun } from "../../healthRuns";
import type { PlanWeek } from "../../marathonPrediction";
import type { AiAssistantResponse, AiContext, AiPlanSession, SessionType } from "./types";
import { classifySymptoms } from "./intentDetection";
import {
  buildBoostNextWeekVolumePatches,
  buildInjuryNoRunningPatches,
  buildMissedWorkoutPatches,
  buildRemoveAllBikePatches,
  buildTaperWindowPatches,
  findMissedYesterdaySession,
  findRaceAnchorIsoFromContext,
  generateMarathonPlanV2ToRace,
  isoDateLocalNoon,
} from "./coachPlanMutations";
import {
  computePaceBasedPrediction,
  computeWeekPlanCompletionPercent,
  formatPaceGerman,
  type PaceBasedPrediction,
} from "./coachRacePrediction";

export function normalizeCoachText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function has(text: string, ...words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function extractDefaultYear(isoToday: string): number {
  const d = new Date(isoToday);
  return Number.isFinite(d.getFullYear()) ? d.getFullYear() : 2026;
}

function detectNoRunningWeekCount(text: string): number | null {
  const t = text;
  const blockRunPhrase =
    has(t, "nicht laufen", "kann nicht laufen", "ohne laufen", "kein laufen") ||
    /\b\d+\s*wochen\b.*nicht\s+laufen|nicht\s+laufen.*\d+\s*wochen\b/.test(t);
  const injuryAnkle = has(t, "verdreht", "knochel", "knoechel", "verletz");
  if (!(blockRunPhrase || (injuryAnkle && /\b\d+\s*wochen\b|zwei\s*wochen|2\s*wochen/.test(t)))) return null;

  let wk: number | null = null;
  const digits = /\b(\d+)\s*wochen?\b/.exec(t);
  if (digits) wk = Math.min(8, Math.max(1, Number(digits[1])));
  if (wk == null && /\b(zwei wochen|2\s*wochen)\b/.test(t)) wk = 2;
  if (wk == null && has(t, "drei wochen")) wk = 3;
  return wk ?? 2;
}

function detectVolumePct(text: string): number | null {
  const t = text;
  if (!has(t, "volumen", "umfang", "mehr trainieren", "erhohe", "erhoh") && !/\b15\s*%/.test(t)) return null;
  if (!has(t, "nachste", "naechste", "kommende") || !has(t, "woche")) return null;

  const m = /(\d{1,2})\s*%/.exec(t);
  if (m) return Math.min(40, Math.max(5, Number(m[1])));
  return 15;
}

function parseRaceDateGerman(text: string, defaultYear: number): Date | null {
  const months: Array<{ re: RegExp; idx: number }> = [
    { re: /\bjanuar\b/i, idx: 0 },
    { re: /\bfeb(r|ruar)?\b/i, idx: 1 },
    { re: /\bm(a|ae)rz\b|\bmarz\b/i, idx: 2 },
    { re: /\bapril\b/i, idx: 3 },
    { re: /\bmai\b/i, idx: 4 },
    { re: /\bjuni\b/i, idx: 5 },
    { re: /\bjuli\b/i, idx: 6 },
    { re: /\baugust\b/i, idx: 7 },
    { re: /\bseptember\b|\bsep\.?\b/i, idx: 8 },
    { re: /\boktober\b|\bokt\.?\b/i, idx: 9 },
    { re: /\bnovember\b/i, idx: 10 },
    { re: /\bdezember\b/i, idx: 11 },
  ];

  let dayNum: number | null = null;
  const dotted = /\b(\d{1,2})\.(?:\s*|$|[a-zä])/.exec(text);
  const spaced = /\b(\d{1,2})\s+(?=[a-zä])/.exec(text);
  if (dotted) dayNum = Number(dotted[1]);
  else if (spaced) dayNum = Number(spaced[1]);

  let monthIdx: number | null = null;
  for (const mo of months) {
    if (mo.re.test(text)) {
      monthIdx = mo.idx;
      break;
    }
  }

  if (dayNum === null || monthIdx === null || dayNum < 1 || dayNum > 31) return null;
  return new Date(defaultYear, monthIdx, dayNum);
}

export function stripBikeIntent(text: string): boolean {
  return (
    (has(text, "streiche", "entferne", "loswerden", "rausnehmen", "streichen") &&
      has(text, "rennrad", "rennrad-einheit", "rennrad einheit", "rad-einheit")) ||
    (text.includes("streiche alle") && text.includes("rennrad"))
  );
}

/**
 * Relative time until the race from natural German phrasing (normalized text from `normalizeCoachText`).
 * Returns null if no relative window is mentioned.
 */
export function extractRelativeDaysUntilRaceGerman(normalizedText: string): number | null {
  const t = normalizedText;
  if (/\buber?morgen\b/.test(t)) return 2;
  if (/\bnachste\s+woche\b|\bnaechste\s+woche\b/.test(t)) return 7;
  if (/\bin\s+zwei\s+wochen\b|\bin\s+2\s*wochen\b/.test(t)) return 14;
  if (/\bin\s+drei\s+wochen\b|\bin\s+3\s*wochen\b/.test(t)) return 21;
  if (/\bin\s+(einem|1)\s+monat\b/.test(t)) return 30;

  const mw = /\bin\s+(\d+)\s*wochen\b/.exec(t);
  if (mw) return Math.min(366, Math.max(1, Number(mw[1]) * 7));

  const md = /\bin\s+(\d+)\s*tag(?:en|e)?\b/.exec(t);
  if (md) return Math.min(366, Math.max(1, Number(md[1])));

  return null;
}

function hasCompetitionCue(t: string): boolean {
  return (
    has(t, "rennen", "marathon", "halbmarathon", "wettkampf", "wettbewerb") ||
    /\b(beim|zum|ans)\s+rennen\b/.test(t) ||
    /\brennen\s+(ist|steht|findet)\b/.test(t)
  );
}

/** True when the user is asking for tapering / pre-race plan adjustment. */
function wantsTaperCoachResponse(t: string, rel: number | null): boolean {
  if (has(t, "taper", "tapern", "tapering")) return true;
  if (rel != null && hasCompetitionCue(t)) return true;
  if (rel != null && has(t, "passe meinen plan", "passe den plan", "plan anpass", "plan angepas")) return true;
  return false;
}

function raceAnchorIsoFromTodayPlusDays(context: AiContext, daysAhead: number): string {
  const base = new Date(context.todayIso);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + daysAhead);
  return isoDateLocalNoon(d);
}

/**
 * @deprecated Uses `extractRelativeDaysUntilRaceGerman` + `wantsTaperCoachResponse`.
 * Returns a positive day hint when taper flow applies; otherwise null.
 */
export function taperIntentDays(text: string): number | null {
  const nt = normalizeCoachText(text);
  const rel = extractRelativeDaysUntilRaceGerman(nt);
  if (!wantsTaperCoachResponse(nt, rel)) return null;
  return rel ?? 10;
}

function missedYesterdayIntent(text: string): boolean {
  return (
    has(text, "gestrigen", "gestrig", "gestern") &&
    has(text, "verpasst", "nicht geschafft", "verpass") &&
    !has(text, "morgen")
  );
}

function hrZonesIntent(text: string): boolean {
  return (
    has(text, "herzfrequenz", "pulszone", "puls") &&
    has(text, "lang", "lange", "laeuf") &&
    !has(text, "ernahr", "essen")
  );
}

function marathonPlanCreateIntent(text: string): boolean {
  return (
    has(text, "marathon") &&
    (has(text, "plan", "erstell", "aufbau", "trainingsplan") || /\d{1,2}\.\s*september/.test(text))
  );
}

function progressIntent(text: string): boolean {
  return (
    ((has(text, "wie lauft") || has(text, "wie laeuft")) && has(text, "training")) ||
    has(text, "sub-3", "sub 3", "sub3", "unter 3 stunden") ||
    (has(text, "auf kurs") && has(text, "marathon"))
  );
}

function nutritionLongRunIntent(text: string): boolean {
  return (
    has(text, "essen", "nahrung", "ernahr") &&
    /2\s*stunden|zwei\s*stunden|\b120\s*min\b/.test(text) &&
    has(text, "lang", "lauf")
  );
}

function hydrationMarathonIntent(text: string): boolean {
  return has(text, "marathon") && (has(text, "trink", "wasser", "flussig", "fluessig") || /\bml\b|\bl\b/.test(text));
}

function buildHrZoneCoachMessage(hrMax: number | null | undefined): string {
  if (typeof hrMax === "number" && Number.isFinite(hrMax) && hrMax > 0) {
    const lo = Math.round(hrMax * 0.65);
    const hi = Math.round(hrMax * 0.78);
    const cap = Math.round(hrMax * 0.8);
    return (
      `Für aerobe Basis und lange Läufe bleib in HF-Zone 2: ca. ${lo}–${hi} bpm ` +
      `(ca. 65–75 % deiner Max-HF ${hrMax} bpm; orientiere dich eher unter ${cap} bpm statt Richtung Schwellenbereich). ` +
      `So bleibt die Intensität genug für mitochondriale und fettoxidative Qualität, ohne dich zu verzuckern. ` +
      `Max-HF-Wert stammt aus deinem Profil; Plan unverändert.`
    );
  }
  return (
    "Für lange Läufe nutze üblicherweise HF-Zone 2 (ca. 65–75 % HFmax), erkennbar an «gerade noch vollständigen Sätzen». " +
    "Ohne gespeicherte Max-HF im Profil nenne ich keine BPM-Werte — bitte Max-HF eintragen oder sportmedizinisch bestimmen. Plan unverändert."
  );
}

function progressCoachClosingTip(context: AiContext, prediction: PaceBasedPrediction | null): string {
  if (!prediction) {
    return "Schließe mindestens 2 weitere lange Läufe ab für eine verlässliche Prognose.";
  }
  const weeksFocus = prediction.gapToSubThreeSeconds > 300 ? 6 : 4;
  const paceHold = formatPaceGerman(prediction.predictedPaceSecPerKm);
  if (prediction.isSubThreeHourTarget) {
    const nextLong = context.next14Days?.find((s) => s.type === "long");
    if (nextLong) {
      return `Dein nächster langer Lauf am ${nextLong.day} ${nextLong.date} ist entscheidend — halte ${paceHold}.`;
    }
    return `Dein nächster Langlauf ist entscheidend — halte etwa ${paceHold}.`;
  }
  if (prediction.gapToSubThreeSeconds <= 300) {
    return `Fokussiere dich auf Tempo in den nächsten ${weeksFocus} Wochen.`;
  }
  return `Fokussiere dich auf Langläufe in den nächsten ${weeksFocus} Wochen.`;
}

function coachProgressAssessment(context: AiContext, userNorm: string): string {
  const planAsWeeks = context.plan as PlanWeek[];
  const healthRuns: StoredHealthRun[] = Array.isArray((context as any).healthRuns)
    ? ((context as any).healthRuns as StoredHealthRun[])
    : [];
  const now = new Date(context.todayIso);
  const adhered = computePlanAdherenceScore({ plan: planAsWeeks, logs: context.logs, healthRuns, now });
  const trainable = flattenTrainableSessionsFromPlan(planAsWeeks);
  const ringPct = computeTrainableWholePlanProgressPct(trainable, context.logs);
  const weekPct = computeWeekPlanCompletionPercent(context, now);
  const prediction = computePaceBasedPrediction(context);
  const tip = progressCoachClosingTip(context, prediction);

  const sub3Asked = /sub[\s-]?3|unter\s+3\s*stunden/.test(userNorm);
  const sub3Line = sub3Asked
    ? " SUB-3h ist sportlich ambitioniert: neben Treue zählen langsame Progression, Gesundheit und konkrete Tempo-Sessions — der Score spiegelt nur die Umsetzung bis heute."
    : " Für ambitionierte Zielzeiten brauchst du hohe Plan-Treue plus spezifische Tempo- und Langlauf-Progression; der Score spiegelt nur die Umsetzung bis heute.";

  const executionPct = adhered.score;
  const onTrack =
    adhered.band === "green"
      ? "du bist im grünen Bereich bei der Umsetzung der fälligen Einheiten"
      : adhered.band === "yellow"
        ? "du bist im mittleren Bereich — noch steuerbar"
        : "du liegst unter dem Wunsch-Korridor bei der Umsetzung bis heute";

  const target = context.goals?.targetTime || "dein Rennziel";

  if (prediction && prediction.confidenceLevel !== "low") {
    return `${prediction.interpretation} Umsetzung (fällige Einheiten bis heute): ${executionPct}%; Gesamtvorbereitung (Start-Ring): ${ringPct}%; diese Woche (Einheiten): ${weekPct}%. ${tip}`;
  }

  if (prediction && prediction.confidenceLevel === "low") {
    return (
      `Umsetzung (fällige Einheiten bis heute): ${executionPct}%; Gesamtvorbereitung (Start-Ring): ${ringPct}%; diese Woche (Einheiten): ${weekPct}%. Kurzfassung: ${Math.round(adhered.confidence)} % Daten-Sicherheit (${onTrack}). Zielreferenz: ${target}.${sub3Line} ` +
      `${prediction.interpretation} ${tip}`
    );
  }

  return (
    `Kurzfassung: Umsetzung bis heute ${executionPct}%; Gesamtvorbereitung (Ring) ${ringPct}%; ${Math.round(adhered.confidence)} % Daten-Sicherheit (${onTrack}). ` +
    `Zielreferenz: ${target}.${sub3Line} Sobald du mehr lange Läufe abgeschlossen hast, kann ich eine präzise Zeitprognose berechnen. ${tip}`
  );
}

function actionWithItems(
  type: import("./types").AiActionType,
  payload: Record<string, unknown>,
  message: string,
  items: string[],
): AiAssistantResponse {
  return {
    mode: "coach",
    message,
    action: {
      type,
      payload,
      preview: {
        title: "Vorgeschlagene Anpassung",
        items,
        confirmLabel: "Ja, übernehmen",
        secondaryLabel: "Anpassen",
        cancelLabel: "Nein",
      },
    },
  };
}

function tryTaperDeterministicResponse(text: string, context: AiContext): AiAssistantResponse | null {
  const taperRel = extractRelativeDaysUntilRaceGerman(text);
  if (!wantsTaperCoachResponse(text, taperRel)) return null;

  const raceIsoForTaper =
    taperRel != null ? raceAnchorIsoFromTodayPlusDays(context, taperRel) : findRaceAnchorIsoFromContext(context);

  if (!raceIsoForTaper) {
    return {
      mode: "coach",
      message:
        "Ich konnte kein Renndatum finden. Wann ist dein Wettkampf? " +
        "Sag mir das Datum oder wie viele Tage noch, dann passe ich den Plan sofort an.",
    };
  }

  const taperResult = buildTaperWindowPatches(context, raceIsoForTaper);
  if (!taperResult.patches.length) {
    return {
      mode: "coach",
      message:
        "Bis zehn Tage vor deinem Wettkampf finde ich keine anpassbaren Einheiten im aktuellen Plan — prüfe bitte die Daten oder erweitere den Plan in die Zukunft. " +
        (taperRel != null ? "Deine genannten Tage seit heute wurden trotzdem als WK-Anker genutzt." : ""),
    };
  }

  const previewNote = taperResult.summaryLine + (taperRel != null ? " (Datum aus Spracheingabe)." : "");

  const shortLead = taperResult.shortLeadWarning ? `\n\n${taperResult.shortLeadWarning}` : "";

  return actionWithItems(
    "taper_before_race",
    { raceDateIsoOverride: raceIsoForTaper, relativeDaysFromIntent: taperRel },
    `${previewNote} Ich schlage konkrete Taper-Anpassungen im Entwurf vor (Band 1–2 T.: sehr leicht, 3–7 T.: ohne Qualität, 8–10 T.: weniger Volumen, Qualität möglich).${shortLead} Bitte bestätigen.`,
    taperResult.patches.slice(0, 12).map((p) => `${p.sessionId}: ${p.changes.title || "Taper-Einheit"}`),
  );
}

const HARD_REPLACE_TYPES = new Set<SessionType>(["interval", "tempo", "race"]);

function calendarDaysBetweenIso(isoA: string, isoB: string): number | null {
  const da = new Date(`${isoA.slice(0, 10)}T12:00:00`);
  const db = new Date(`${isoB.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(da.getTime()) || !Number.isFinite(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/**
 * One short German coaching line for replace-workout previews (never blocking; user confirms).
 */
export function buildReplaceWorkoutCoachFeedbackGerman(opts: {
  before: AiPlanSession | null;
  afterType: SessionType;
  afterTitle: string;
  raceDateIso: string | null;
  sessionDateIso: string;
  todayIso: string;
}): string {
  const { before, afterType, afterTitle, raceDateIso, sessionDateIso } = opts;
  const softClose = " — du entscheidest.";
  const raceDay = raceDateIso?.slice(0, 10);
  const daysUntilRace =
    raceDay && sessionDateIso ? calendarDaysBetweenIso(sessionDateIso, raceDay) : null;

  const beforeTypeName =
    before?.type === "rest"
      ? "Ruhetag"
      : before?.type === "interval"
        ? "Intervalltraining"
        : before?.type === "tempo"
          ? "Tempotraining"
          : before?.type === "long"
            ? "Langlauf"
            : before?.type === "bike"
              ? "Rennrad‑Training"
              : before?.type === "easy"
                ? "Easy Run"
                : before?.type === "strength"
                  ? "Krafttraining"
                  : before?.type === "race"
                    ? "Renn‑Einheit"
                    : "";

  const beforeLabel =
    before?.type === "rest"
      ? "Ruhetag"
      : before?.title?.trim()
        ? `«${before.title}»`
        : "die geplante Einheit";

  /** Am letzten Vortag vor dem Wettkampf («Session → Renntermin» ist 1). */
  if (daysUntilRace === 1) {
    if (HARD_REPLACE_TYPES.has(afterType)) {
      const lab =
        afterType === "interval"
          ? "Intervalltraining"
          : afterType === "tempo"
            ? "Tempotraining"
            : "Harte Einheit";
      return `${lab} am Tag vor dem Wettkampf kann die Wettkampf‑Frische stark senken — nur wenn dir sonst kein schonender Zeitpunkt möglich ist.${softClose}`;
    }
    if (afterType === "easy") {
      return `Ein lockerer Easy Run am Tag vor dem Wettkampf ist meist konservativ statt zusätzlicher Belastung — passt oft gut.${softClose}`;
    }
  }

  if (before?.type === "bike" && afterType === "easy") {
    return `Rennrad‑Training gegen einen lockeren Lauf auszutauschen bleibt meist nah an Grundlagenausdauer — bleib beim Lauf aber klar unter frühere Intensität, Zone 2.${softClose}`;
  }

  if (before?.type === "rest" && afterType === "easy") {
    return `Ruhetag durch einen kurzen Easy Run zu ersetzen ist in der Regel vertretbar, wenn dich nichts stark belastet hat.${softClose}`;
  }

  if (before?.type === "rest" && HARD_REPLACE_TYPES.has(afterType)) {
    const lab =
      afterType === "interval"
        ? "Intervalltraining"
        : afterType === "tempo"
          ? "Tempotraining"
          : "eine sehr harte Einheit";
    return `${lab} statt Ruhetag belastet die Erholung klar mehr als ein lockerer oder freier Tag.${softClose}`;
  }

  if (before?.type === "long" && afterType === "easy") {
    return `Vom Langlauf zu einem kurzen Easy Run zu wechseln spart Laufvolumen und kann die Wettkampf‑Spezifik der Woche deutlich verändern.${softClose}`;
  }

  if (before?.type === "long" && afterType === "bike") {
    return `Ein Rennrad‑Ersatz nimmt weniger Laufmechanik ins Bein als der Langlauf — die geplante Lauf‑Dauer wirkt dadurch weniger konkret auf den Marathon.${softClose}`;
  }

  if (before?.type === "long" && afterType === "strength") {
    return `Das Long‑Run‑Volumen zu ersetzen schlägt Lauf‑Dauer gegen Kraft — die Marathon‑Spezifik der Woche leidet eher beim Laufen.${softClose}`;
  }

  if (before && before.type !== "rest" && afterType === "rest") {
    const src = beforeTypeName || beforeLabel;
    return `${src === "die geplante Einheit" ? beforeLabel : src} gegen einen Ruhetag zu tauschen lässt geplanten Reiz ausfallen — prüfe, ob sich das mit Zielen und Kontext verträgt.${softClose}`;
  }

  if (before?.type === "easy" && afterType === "bike") {
    return `Lockerer Lauf gegen Rennrad tauschen lässt beides meist bei ähnlicher Grundlagenausdauer.${softClose}`;
  }

  if (before?.type === "strength" && afterType === "easy") {
    return `${beforeTypeName || "Krafttraining"} durch einen lockeren Lauf zu tauschen wirkt meist neutral bis leicht entlastend für die nächsten Laufreize.${softClose}`;
  }

  if (before?.type === "interval" && afterType === "easy") {
    return `Qualitätstreize runterzufahren und statt Intervallen locker zu laufen senkt kurzfristige Intensität zugunsten mehr Regeneration.${softClose}`;
  }

  return `${beforeLabel} durch «${afterTitle}» zu ersetzen wirkt strukturell machbar — prüfe nur kurz, ob es noch zur Gesamtwoche passt.${softClose}`;
}

/**
 * Returns a fully specified coach response for known German prompts, or `null` to fall through to `coachBrain`.
 */
export function tryDeterministicCoachResponse(userInput: string, context: AiContext): AiAssistantResponse | null {
  const text = normalizeCoachText(userInput);
  if (!text) return null;

  const taperFirst = tryTaperDeterministicResponse(text, context);
  if (taperFirst) return taperFirst;

  const year = extractDefaultYear(context.todayIso);

  // Symptom/illness/fatigue handling (uses full message + last turns).
  // Never invent symptoms; if unsure, ask exactly one clarifying question.
  const symptom = classifySymptoms({ message: userInput, turns: context.conversationTurns });
  if (symptom.clarifyingQuestion) {
    // Only ask when the user is actually talking about wellbeing-related topics.
    if (symptom.symptomType !== "unknown" || /\b(krank|schnupfen|kopfschmerz|fieber|husten|schmerz|muede|mude|erschoepft|erschopft)\b/.test(text)) {
      return { mode: "coach", message: symptom.clarifyingQuestion };
    }
  }
  if (symptom.symptomType === "illness" && symptom.severity === "low") {
    // Keep legacy behavior for very vague "ich bin krank" without any details:
    // let the main coach pipeline (mock/cloud) handle it (incl. provider fallback messaging).
    if (
      symptom.symptomPhrase === "krank" &&
      !/\b(schnupfen|kopfschmerz|kopfschmerzen|erkaelt|erkaltet|erkaltung|husten|fieber|infekt|halsschmerz|uebelkeit|ubel)\b/.test(text) &&
      !/\?|plan\s+anpass|training\s+reduz|ruhetag|tausch|swap|vertausch/.test(text)
    ) {
      return null;
    }
    const quoted = symptom.symptomPhrase ? `„${symptom.symptomPhrase}“` : "deine Symptome";
    const action = {
      type: "adjust_plan_for_illness" as const,
      payload: { reason: "minor_illness", severity: "low" },
      preview: {
        title: "Vorschlag (leichte Erkrankung)",
        items: [
          "Heute keine Intensität (Intervalle/Tempo streichen).",
          "Stattdessen locker 20–40 min oder kompletter Ruhetag.",
          "Wenn Fieber/Brustsymptome: Pause.",
        ],
        confirmLabel: "Ja, übernehmen",
        secondaryLabel: "Anpassen",
        cancelLabel: "Nein",
      },
    };
    return {
      mode: "coach",
      message:
        `Danke für die Einordnung: du beschreibst ${quoted}. ` +
        "Wenn es wirklich «leicht» ist und ohne Fieber/Brustsymptome, ist lockeres Training ok — aber heute bitte keine harte Einheit. " +
        "Ich kann dir dafür eine konservative Anpassung für heute vorschlagen (immer erst mit Bestätigung).",
      action,
    };
  }
  if (symptom.symptomType === "fatigue") {
    const chronic = /\b(seit wochen|seit tagen|die letzten wochen|dauernd|schon lange)\b/.test(text);
    const quoted = symptom.symptomPhrase ? `„${symptom.symptomPhrase}“` : "Müdigkeit/Erschöpfung";
    const action = {
      type: "adjust_plan_for_illness" as const,
      payload: { reason: chronic ? "chronic_fatigue" : "fatigue", severity: chronic ? "medium" : "low" },
      preview: {
        title: chronic ? "Vorschlag (Überlastung / anhaltende Müdigkeit)" : "Vorschlag (Müdigkeit heute)",
        items: chronic
          ? ["Diese Woche Volumen/Intensität reduzieren.", "Mindestens 1 zusätzlicher Ruhetag.", "Nächste harte Einheit ersetzen."]
          : ["Heute kein hartes Training.", "Stattdessen locker 20–40 min oder kompletter Ruhetag.", "Morgen neu bewerten."],
        confirmLabel: "Ja, übernehmen",
        secondaryLabel: "Anpassen",
        cancelLabel: "Nein",
      },
    };
    return {
      mode: "coach",
      message:
        `Verstanden: du beschreibst ${quoted}. ` +
        (chronic
          ? "Das klingt eher nach anhaltender Ermüdung/Überlastung — da hilft weniger «durchbeißen», mehr Entlastung über mehrere Tage."
          : "Wenn du heute einfach müde bist, ist das meist ein 1-Tages-Problem: Intensität rausnehmen, locker bleiben.") +
        " Ich kann dir dafür eine passende, bestätigungspflichtige Plan-Anpassung vorschlagen.",
      action,
    };
  }
  if (symptom.symptomType === "injury") {
    // Only when pain + location (or strong injury term) matched; keep calm if user said "leicht".
    const part = symptom.bodyPart ? `am ${symptom.bodyPart}` : "";
    const quoted = symptom.symptomPhrase ? `„${symptom.symptomPhrase}“` : "Schmerzen";
    const weeksNoRun = detectNoRunningWeekCount(text);
    const wk = weeksNoRun ?? (symptom.severity === "high" ? 2 : 1);
    const patches = buildInjuryNoRunningPatches(context, wk);
    const action =
      patches.length > 0
        ? {
            type: "adapt_plan_injury_no_run" as const,
            payload: { weeks: wk, reason: "injury_signal" },
            preview: {
              title: "Vorschlag (Verletzung / Schmerz)",
              items: patches.slice(0, 6).map((p) => `${p.sessionId}: ${p.changes.title || "Anpassung"}`),
              confirmLabel: "Ja, übernehmen",
              secondaryLabel: "Anpassen",
              cancelLabel: "Nein",
            },
          }
        : {
            type: "adjust_plan_for_illness" as const,
            payload: { reason: "injury_signal", severity: symptom.severity },
          };
    return {
      mode: "coach",
      message:
        `Danke — du nennst ${quoted}${part ? ` (${part})` : ""}. ` +
        "Wenn das beim Laufen auftritt oder «stechend» ist: heute keine Intensität, lieber entlasten. " +
        `Ich kann eine konservative Anpassung für die nächsten ${wk} Woche(n) als Vorschlag vorbereiten (immer erst nach Bestätigung).`,
      action,
    };
  }

  // Explicit skip today (not health-specific): keep it minimal and confirmation-based.
  if (has(text, "streich", "streiche", "auslassen", "skip") && has(text, "heute") && has(text, "training", "einheit")) {
    const action = {
      type: "adjust_plan_for_illness" as const,
      payload: { reason: "skip_today", severity: "low" },
      preview: {
        title: "Heute auslassen",
        items: ["Heute als Ruhetag setzen (statt Training).", "Keine weiteren Änderungen ohne deine Bestätigung."],
        confirmLabel: "Ja, übernehmen",
        secondaryLabel: "Anpassen",
        cancelLabel: "Nein",
      },
    };
    return {
      mode: "coach",
      message:
        "Okay — wenn du das Training **heute** komplett streichen willst, kann ich dir als Vorschlag **heute einen Ruhetag** eintragen. " +
        "Bestätige unten, dann setze ich das als Plan-Änderung um.",
      action,
    };
  }

  if (nutritionLongRunIntent(text)) {
    return {
      mode: "coach",
      message:
        "Etwa 2–3 h vor einem langen Lauf: leicht verdauliche Kohlenhydrate (z. B. Haferflocken/Reiswaffeln/Toast + Honig), moderates Protein, wenig Fett und Ballaststoffe, " +
        "dazu reichlich Flüssigkeit und ggf. leicht salzige Komponente bei Hitze. " +
        "90–30 Min vor Start: nur noch kleine Snacks, z. B. Banane oder Energy-Riegel. " +
        "Plan unverändert.",
    };
  }

  if (hydrationMarathonIntent(text)) {
    return {
      mode: "coach",
      message:
        "Für den Marathon als grobe Praxisregel: trinke nach Durst, aber plane meist etwa **400–800 ml pro Stunde** (mehr bei Hitze/hohem Schweißverlust, weniger bei Kälte). " +
        "Wichtig: nicht nur Wasser — nimm auch **Natrium/Elektrolyte** (sonst Hyponatriämie-Risiko bei sehr viel Wasser) und kombiniere mit Kohlenhydraten. " +
        "Wenn du mir Temperatur + ungefähre Schweißrate (stark/mittel/gering) sagst, kann ich dir eine engere Spanne vorschlagen. Plan unverändert.",
    };
  }

  if (hrZonesIntent(text)) {
    return { mode: "coach", message: buildHrZoneCoachMessage(context.maxHeartRateBpm) };
  }

  if (progressIntent(text)) {
    return { mode: "coach", message: coachProgressAssessment(context, text) };
  }

  const weeksNoRun = detectNoRunningWeekCount(text);
  if (weeksNoRun) {
    const patches = buildInjuryNoRunningPatches(context, weeksNoRun);
    if (!patches.length) {
      return {
        mode: "coach",
        message:
          "Ich finde in den nächsten Wochen keine passenden Lauf-Sessions zum Ersetzen — Plan ggf. prüfen oder Zeitraum genauer nennen.",
      };
    }
    return actionWithItems(
      "adapt_plan_injury_no_run",
      { weeks: weeksNoRun, reason: "no_running_window" },
      `Ich habe für ${weeksNoRun} Woche(n) alle Lauf-Sessions in diesem Fenster durch sanfte Alternativen (Rad/Schwimmen-ähnlich am Rad, Ruhetag) ersetzt — bitte bestätigen.`,
      patches.slice(0, 6).map((p) => `${p.sessionId}: ${p.changes.title || "Anpassung"}`),
    );
  }

  if (stripBikeIntent(text)) {
    const patches = buildRemoveAllBikePatches(context);
    if (!patches.length) {
      return { mode: "coach", message: "Ich habe keine Rennrad-Einheiten im aktuellen Plan gefunden. Nichts geändert." };
    }
    return actionWithItems(
      "remove_all_bike_sessions",
      { removed: patches.length },
      `Ich streiche ${patches.length} Rennrad-Einheit(en) (werden zu Ruhetagen). Bitte bestätigen.`,
      patches.slice(0, 8).map((p) => `${p.sessionId}: Frei statt Rad`),
    );
  }

  const volPct = detectVolumePct(text);
  if (volPct) {
    const patches = buildBoostNextWeekVolumePatches(context, volPct);
    if (!patches.length) {
      return {
        mode: "coach",
        message: "Für die nächste Kalenderwoche habe keine Laufkilometer gefunden — bitte Datum oder Plan prüfen.",
      };
    }
    const sumKm = patches.reduce((a, p) => a + Number(p.changes.km ?? 0), 0);
    return actionWithItems(
      "boost_next_week_volume",
      { pct: volPct },
      `Annahme: «nächste Woche» = folgende Kalenderwoche nach dieser. Ich erhöhe die Laufkilometer dort um ca. ${volPct}% (übernommene Einheiten im Entwurf; neue WKZ-Summe grob über ${Math.round(sumKm)} km geplant vs. höher proportioniert je Einheit). Bitte bestätigen.`,
      patches.slice(0, 10).map((p) => `${p.sessionId}: ${p.changes.title || "Einheit"}`),
    );
  }

  if (marathonPlanCreateIntent(text)) {
    const race = parseRaceDateGerman(text, year);
    if (!race) {
      return { mode: "coach", message: "Bitte gib den Marathon-Termin mit Tag und Monat an (z. B. «14. September»). Ich habe nichts geändert." };
    }
    const today = new Date(context.todayIso);
    const draft = generateMarathonPlanV2ToRace(today, race);
    if (!validateTrainingPlanV2Integrity(draft)) {
      return {
        mode: "coach",
        message:
          "Beim automatischen Marathon-Plan ist ein Integritätsfehler aufgetreten — der Entwurf wurde nicht übernommen. " +
          "Versuche denselben Befehl mit einem klaren Datum (Tag + Monat) erneut, oder passe den bestehenden Plan Schritt für Schritt im **Woche**-Tab an. Wenn das wieder fehlschlägt: **Einstellungen → Backup JSON** sichern, App neu laden, und beschreib mir kurz dein gewünschtes Renn-Datum — ich formuliere dir dann einen konkreten manuellen Planaufbau ohne Generator.",
      };
    }
    return actionWithItems(
      "replace_training_plan_generated",
      { raceIso: race.toISOString(), weeks: draft.weeks?.length ?? 0 },
      `Annahmen: Marathon am ${race.toLocaleDateString("de-DE")}; strukturierter Plan Basis→Build→Taper automatisch gefüllt. Bestätigung ersetzt deinen bestehenden Plan (Patch-Überlagerungen werden geleert).`,
      [`Neue Wochen: ${draft.weeks?.length ?? 0}`, `Session-Zeilen: ${draft.workouts?.length ?? 0}`],
    );
  }

  if (missedYesterdayIntent(text)) {
    const missed = findMissedYesterdaySession(context);
    if (!missed) {
      return {
        mode: "coach",
        message: "Gestern war laut Plan Ruhetag oder keine Session — nichts zu korrigieren.",
      };
    }
    if (context.logs?.[missed.id]?.done) {
      return { mode: "coach", message: `Die Einheit «${missed.title}» ist bereits erledigt — alles gut.` };
    }
    const patches = buildMissedWorkoutPatches(context);
    const hardAhead = context.plan.flatMap((w) => w.s).filter((s) => ["interval", "tempo"].includes(s.type)).length;

    const explain =
      `Gestern stand «${missed.title}» (${missed.type}) aus. ` +
      (patches.length
        ? "Vorschlag: Teilvolumen heute weich integrieren (siehe Entwurf) statt die harte Einheit nachzuholen — so vermeidest du eine Doppelbelastung."
        : hardAhead > 4
          ? "Woche ist schon qualitativ dicht: eher streichen oder auf einen freien Tag schieben statt heute alles doppelt zu fahren."
          : "Wenn du frisch bist, kannst du die fehlende Distanz als zusätzliche leichte Zone-2-Minuten über 2 Tage verteilen.");

    if (!patches.length) {
      return { mode: "coach", message: explain + " Kein automatischer Plan-Patch nötig." };
    }
    return actionWithItems(
      "integrate_missed_workout",
      { missedId: missed.id },
      explain + " Bestätige, um die heutige Einheit antizyklisch anzupassen.",
      patches.map((p) => `${p.sessionId}: ${p.changes.title || "Anpassung heute"}`),
    );
  }

  return null;
}
