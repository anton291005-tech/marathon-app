/*
 * STEP 1 — DIAGNOSIS A–D (pipeline: AiCoachPanel → parseIntent → resolveSwap)
 *
 * A) "tausche training von heute und morgen"
 * - parseIntent fires swap? YES — "tausch" ⊂ "tausche", plus heute+morgen relative pair cue.
 * - resolveSwap finds both sessions? YES when the plan has rows on both local calendar days via
 *   tryResolveRelativeTwoDaySwap (inferTwoDistinctRelativeCalendarDays); failure would be
 *   sessionsOnLocalCalendarDay → empty → not_found (source_not_found / target_not_found), not parseIntent.
 *
 * B) "tausche training vom 8 mai mit dem vom 9 mai"
 * - parseIntent fires swap? YES — "tausch" ⊂ "tausche".
 * - resolveSwap (pre-absolute-parser): often NO — relative fast path was skipped (no heute/morgen in scorer-only
 *   path); target/source scores missed calendar dates in free text → pickBest below threshold → not_found.
 *   Fixed: ordered absolute German / numeric dates → sessions on those days.
 *
 * C) "ich will das krafttraining von heute mit dem lauf von morgen tauschen"
 * - parseIntent fires swap? YES — "tauschen" contains "tausch".
 * - resolveSwap: needs "mit"-halves + type hints; multiple sessions per day → ambiguous candidates instead of silent pick.
 *
 * D) "heute und morgen tauschen"
 * - parseIntent fires swap? YES — relative pair (heute∧morgen); "tauschen" contains "tausch".
 * - resolveSwap finds both? YES — same two-day relative path as A.
 */
import { looksLikeReplaceWorkoutIntent } from "./extractReplaceWorkoutIntent";

export type AIIntent =
  | { type: "swap_workouts"; raw: string }
  | { type: "replace_workout"; raw: string }
  | { type: "convert_workout_to_run"; raw: string }
  | { type: "none" };

function normInput(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}„“"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function word(re: RegExp, s: string): boolean {
  return re.test(s);
}

/** Unique Mo–So in reading order (accents already stripped). */
function extractGermanWeekdayCount(l: string): number {
  const re = /\b(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(l)) !== null) {
    seen.add(m[1]);
  }
  return seen.size;
}

/** Relative two-day cues without weekday names — heute/morgen/übermorgen/gestern pairs. */
function hasRelativeTwoDayCue(l: string): boolean {
  return (
    (word(/\bheute\b/, l) && word(/\bmorgen\b/, l)) ||
    (word(/\bheute\b/, l) && word(/\bubermorgen\b/, l)) ||
    (word(/\bmorgen\b/, l) && word(/\bubermorgen\b/, l)) ||
    (word(/\bgestern\b/, l) && word(/\bheute\b/, l)) ||
    (word(/\bgestern\b/, l) && word(/\bmorgen\b/, l)) ||
    (word(/\bgestern\b/, l) && word(/\bubermorgen\b/, l)) ||
    (word(/\bheute\b/, l) && word(/\bgestern\b/, l))
  );
}

/** Two ordinal day+month or numeric DD.MM tokens (after normalization). */
function hasTwoCalendarDateCues(l: string): boolean {
  const germanMonth =
    /\b\d{1,2}[.\s]+\s*(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|\b(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{1,2}\b/;
  const shortNumeric = /\b\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\b/;
  const hits = Number(germanMonth.test(l)) + Number(shortNumeric.test(l));
  if (hits >= 2) return true;
  const reTok = /\b\d{1,2}\s+[a-z]{3,}\b/g;
  let tokCount = 0;
  for (let m = reTok.exec(l); m !== null; m = reTok.exec(l)) {
    tokCount += 1;
    if (tokCount >= 2) return true;
  }
  return false;
}

/** Implicit desired outcome: distinct training roles on two days without classic swap verb. */
function hasImplicitSwapOutcome(l: string): boolean {
  if (hasRelativeTwoDayCue(l) && /\b(ruhetag|lauf|lang|intervall|tempo|kraft|training|einheit)\b/.test(l)) {
    return true;
  }
  if (
    /\b(heute|morgen|gestern|ubermorgen)\b/.test(l) &&
    /\b(ruhetag)\b/.test(l) &&
    /\b(lang|lauf|intervall|tempo|kraft)\b/.test(l)
  ) {
    return true;
  }
  if (/\bkann ich\s+morgen\b/.test(l) && /\bheutig/.test(l)) return true;
  if (/\b(lieber|lieber\s+heute|lieber\s+morgen|statt\s+heute)\b/.test(l) && /\b(heute|morgen)\b/.test(l)) {
    return true;
  }
  if (/\bwurde\s+das\s+training\s+lieber\b/.test(l) || /\blieber\s+morgen\s+machen\b/.test(l)) return true;
  if (/\bsoll\s+(heute|morgen)\b[\s\S]{0,120}\b(morgen|heute)\b/.test(l)) return true;
  return false;
}

function hasTrainingOrDayContentWord(l: string): boolean {
  return /\b(training|lauf|laufen|rad|bike|rennrad|intervall|tempo|einheit|ruhetag|kraft|gym|strength|lang|marathon|regeneration)\b/.test(
    l,
  );
}

/**
 * When user wants to reshuffle "everything" / whole week — route to free-form coach, not deterministic swap.
 */
function isVagueBulkWeekSwap(l: string): boolean {
  if (!/\b(tausch|vertausch|swap|verschieb|umtausch|umdreh)/.test(l)) return false;
  if (!/\b(naechste|nachste|kommende|dieser|diese)\s+woche\b/.test(l)) return false;
  if (/\b(heute|morgen|gestern|ubermorgen)\b/.test(l)) return false;
  if (extractGermanWeekdayCount(l) > 0) return false;
  if (hasRelativeTwoDayCue(l)) return false;
  if (hasTwoCalendarDateCues(l)) return false;
  return /\b(alles|gesamten?\s+plan|ganze\s+woche|ganzen\s+plan|komplett)\b/.test(l);
}

/** Trigger-Phrases für Convert-Intent (Bike → äquivalenter Lauf). */
export const CONVERT_TO_RUN_PATTERNS: RegExp[] = [
  /konvertier/i,
  /ändere.*zu.*lauf/i,
  /statt.*rad.*lauf/i,
  /lauftraining.*statt.*rad/i,
  /rennrad.*lauf/i,
  /bike.*lauf/i,
  /in.*lauf.*umwandeln/i,
  /äquivalentes.*lauf/i,
];

export function looksLikeConvertToRunIntent(l: string): boolean {
  return CONVERT_TO_RUN_PATTERNS.some((re) => re.test(l));
}

export function parseIntent(input: string): AIIntent {
  const l = normInput(input);

  if (isVagueBulkWeekSwap(l)) return { type: "none" };

  if (looksLikeConvertToRunIntent(l)) return { type: "convert_workout_to_run", raw: input };

  if (looksLikeReplaceWorkoutIntent(l)) return { type: "replace_workout", raw: input };

  const swapVerb =
    l.includes("tausch") ||
    l.includes("swap") ||
    l.includes("verschieb") ||
    /\bvertausch/.test(l) ||
    l.includes("umtausch") ||
    /\bumdrehen\b/.test(l);

  const structuredPair =
    hasRelativeTwoDayCue(l) ||
    hasTwoCalendarDateCues(l) ||
    (extractGermanWeekdayCount(l) >= 2 && !/\b(wann|wie|warum|was)\s*$/.test(l));

  /** «gegen», connectors — swap intent when two day cues exist. */
  const pairedWithConnector =
    structuredPair &&
    (/\b(gegen|↔)/.test(input) || /\bmit\b/.test(l) || /\bund\b/.test(l) || /\boder\b/.test(l));

  const implicitSwap =
    hasImplicitSwapOutcome(l) ||
    (structuredPair && (hasTrainingOrDayContentWord(l) || pairedWithConnector)) ||
    /** two weekdays + training refs: "intervall dienstag mit ruhetag mittwoch" */
    (extractGermanWeekdayCount(l) >= 2 && hasTrainingOrDayContentWord(l));

  const isSwap =
    swapVerb ||
    structuredPair ||
    implicitSwap ||
    /** legacy: swap into next week without naming weekdays */
    (l.includes("heute") && /\b(naechste|nachste)\s+woche\b/.test(l));

  if (isSwap) return { type: "swap_workouts", raw: input };

  return { type: "none" };
}
