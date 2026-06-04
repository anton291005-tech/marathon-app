/*
 * STEP 1 — A–D (see parseIntent.ts header):
 * - A/D: relative two-day fast path + calendar grouping handles heute↔morgen.
 * - B: absolute German / DD.MM.YY tokens → ordered two-day resolver.
 * - C: «mit»-Halbsegmente + Typ-Filtern statt blind erste Zeile pro Tag.
 */

import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { AiPlanSession, AiPlanWeek } from "../../lib/ai/types";
import { getAppNow } from "../../core/time/timeSystem";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function normalizeText(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    /** Keep «8.5» / «12.05.2026» dots so numeric German dates survive normalization. */
    .replace(/(?<!\d)\.(?!\d)/g, " ")
    .replace(/[!?,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRunningLike(sessionType: string): boolean {
  return ["easy", "interval", "tempo", "long", "race"].includes(sessionType);
}

function parseDistanceHintKm(normalizedRaw: string): number | null {
  const kmMatch = normalizedRaw.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*km\b/);
  if (!kmMatch) return null;
  const n = Number(kmMatch[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function mondayCalendarWeek(day: Date): Date {
  const d = startOfLocalDay(day);
  const dow = d.getDay();
  const shift = (dow + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function nextCalendarMondayAfterThisWeek(today: Date): Date {
  const m = mondayCalendarWeek(today);
  const n = new Date(m);
  n.setDate(n.getDate() + 7);
  return n;
}

type WeekWindow = { start: Date; endExclusive: Date };

function resolveWeekWindow(l: string, today: Date): WeekWindow | null {
  const nextWeekCue = /\b(naechste|nachste|kommende)\s+woche\b|\bkommenden\s+wochen\b/.test(l);
  const thisWeekCue = /\bdiese\s+woche\b/.test(l);
  if (!(nextWeekCue || thisWeekCue)) return null;
  const mon = thisWeekCue ? mondayCalendarWeek(today) : nextCalendarMondayAfterThisWeek(today);
  const endExclusive = new Date(mon);
  endExclusive.setDate(endExclusive.getDate() + 7);
  return { start: mon, endExclusive };
}

/** Local calendar midnight + offset days from `anchor` (typically coach «today»). */
function calendarDayFromOffset(anchor: Date, dayOffset: number): Date {
  const d = startOfLocalDay(anchor);
  d.setDate(d.getDate() + dayOffset);
  return d;
}

/** Map gestern/heute/morgen/übermorgen prose to two distinct calendar days (chronological: early→late). */
function inferTwoDistinctRelativeCalendarDays(norm: string, today: Date): { early: Date; late: Date } | null {
  if (extractGermanWeekdaysInOrder(norm).length >= 2) return null;

  const TOKEN_DELTA: Record<string, number> = {
    gestern: -1,
    heute: 0,
    morgen: 1,
    ubermorgen: 2,
  };

  const ordered: Date[] = [];
  const re = /\b(gestern|heute|morgen|ubermorgen)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const delta = TOKEN_DELTA[m[1]];
    if (delta === undefined) continue;
    const cal = calendarDayFromOffset(today, delta);
    const ts = cal.getTime();
    if (!ordered.length || ordered[ordered.length - 1].getTime() !== ts) {
      ordered.push(cal);
      if (ordered.length >= 2) break;
    }
  }

  const getPairOffsets = (a: number, b: number): { early: Date; late: Date } => {
    const x = calendarDayFromOffset(today, a);
    const y = calendarDayFromOffset(today, b);
    return x.getTime() <= y.getTime() ? { early: x, late: y } : { early: y, late: x };
  };

  if (ordered.length < 2) {
    if (/\bheute\b/.test(norm) && /\bmorgen\b/.test(norm)) return getPairOffsets(0, 1);
    if (/\bgestern\b/.test(norm) && /\bheute\b/.test(norm)) return getPairOffsets(-1, 0);
    if (/\bmorgen\b/.test(norm) && /\bubermorgen\b/.test(norm)) return getPairOffsets(1, 2);
    if (/\bheute\b/.test(norm) && /\bubermorgen\b/.test(norm)) return getPairOffsets(0, 2);
    if (/\bgestern\b/.test(norm) && /\bmorgen\b/.test(norm)) return getPairOffsets(-1, 1);
    return null;
  }

  const sorted = [...ordered].sort((a, b) => a.getTime() - b.getTime());
  return { early: sorted[0], late: sorted[1] };
}

function sessionsOnLocalCalendarDay(plan: AiPlanWeek[], day: Date): AiPlanSession[] {
  const target = startOfLocalDay(day).getTime();
  return plan.flatMap((w) => w.s).filter((s) => {
    const sd = parseSessionDateLabel(s.date);
    if (!sd) return false;
    return startOfLocalDay(sd).getTime() === target;
  });
}

const GERMAN_MONTH_NAMES: Record<string, number> = {
  januar: 0,
  jan: 0,
  februar: 1,
  feb: 1,
  maerz: 2,
  marz: 2,
  april: 3,
  apr: 3,
  mai: 4,
  juni: 5,
  jun: 5,
  juli: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  oktober: 9,
  okt: 9,
  november: 10,
  nov: 10,
  dezember: 11,
  dez: 11,
};

function monthIndexFromToken(tok: string): number | null {
  const k = tok.toLowerCase();
  const v = GERMAN_MONTH_NAMES[k];
  return v === undefined ? null : v;
}

/** Closest future local calendar date (roll year) for month/day vs coach «today». */
function closestFutureMonthDay(day: number, month0: number, today: Date): Date {
  let y = today.getFullYear();
  let candidate = new Date(y, month0, day, 12, 0, 0, 0);
  const t0 = startOfLocalDay(today).getTime();
  while (startOfLocalDay(candidate).getTime() < t0) {
    y += 1;
    candidate = new Date(y, month0, day, 12, 0, 0, 0);
  }
  return startOfLocalDay(candidate);
}

type DateHit = { idx: number; d: Date };

function pushDateHit(hits: DateHit[], idx: number, d: Date) {
  hits.push({ idx, d: startOfLocalDay(d) });
}

/** Collect prose calendar dates in reading order (normalized German, accents stripped). */
function extractOrderedAbsoluteDates(norm: string, today: Date): DateHit[] {
  const hits: DateHit[] = [];
  const seenAt = new Set<number>();

  const tryAdd = (idx: number, d: Date) => {
    const t = startOfLocalDay(d).getTime();
    if (seenAt.has(t)) return;
    seenAt.add(t);
    pushDateHit(hits, idx, d);
  };

  let m: RegExpExecArray | null;

  const re1 = /\b(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{2,4})?\b/g;
  while ((m = re1.exec(norm)) !== null) {
    const d = Number(m[1]);
    const mo0 = Number(m[2]) - 1;
    const yr = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
    if (mo0 >= 0 && mo0 <= 11 && d >= 1 && d <= 31) {
      const dt = m[3]
        ? startOfLocalDay(new Date(yr, mo0, d, 12, 0, 0, 0))
        : closestFutureMonthDay(d, mo0, today);
      tryAdd(m.index, dt);
    }
  }

  const re2 =
    /\b(\d{1,2})[.\s]+\s*(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/g;
  while ((m = re2.exec(norm)) !== null) {
    const d = Number(m[1]);
    const mo0 = monthIndexFromToken(m[2]);
    if (mo0 !== null && d >= 1 && d <= 31) tryAdd(m.index, closestFutureMonthDay(d, mo0, today));
  }

  const re3 =
    /\b(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{1,2})\b/g;
  while ((m = re3.exec(norm)) !== null) {
    const mo0 = monthIndexFromToken(m[1]);
    const d = Number(m[2]);
    if (mo0 !== null && d >= 1 && d <= 31) tryAdd(m.index, closestFutureMonthDay(d, mo0, today));
  }

  hits.sort((a, b) => a.idx - b.idx);
  return hits;
}

function hasSwapVerbNorm(l: string): boolean {
  return (
    l.includes("tausch") ||
    l.includes("swap") ||
    l.includes("verschieb") ||
    /\bvertausch/.test(l) ||
    l.includes("umtausch") ||
    /\bumdrehen\b/.test(l)
  );
}

function dowNumberToGermanName(dow: number): string {
  const names = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
  return names[dow] || "";
}

function inferCalendarDayForPhrase(phrase: string, today: Date): Date | null {
  const p = normalizeText(phrase);
  const hits = extractOrderedAbsoluteDates(p, today);
  if (hits.length) return hits[0].d;

  if (/\bgestern\b/.test(p)) return calendarDayFromOffset(today, -1);
  if (/\bheute\b/.test(p)) return calendarDayFromOffset(today, 0);
  if (/\bmorgen\b/.test(p)) return calendarDayFromOffset(today, 1);
  if (/\bubermorgen\b/.test(p)) return calendarDayFromOffset(today, 2);

  const orderedWd = extractGermanWeekdaysInOrder(p);
  if (orderedWd.length >= 1) {
    return expectedAnchoredCalendarDay(p, today, orderedWd[0]);
  }
  return null;
}

function isStrengthHintInHalf(h: string): boolean {
  return /\b(kraft|krafttraining|gym|strength|gewicht|aufwarm|mobility)\b/.test(h);
}

function isRunLikeHintInHalf(h: string): boolean {
  return /\b(lauf|laufen|langen?\s+lauf|easy|tempo|intervall|interval|progression)\b/.test(h);
}

function isRestHintInHalf(h: string): boolean {
  return /\b(ruhetag|ruh\s*tag|regeneration|gar\s*nichts)\b/.test(h);
}

function sessionMatchesStrengthHint(s: AiPlanSession): boolean {
  const t = `${s.type} ${s.title}`.toLowerCase();
  return s.type === "strength" || /\b(kraft|gym|strength|gewicht)\b/.test(t);
}

function sessionMatchesRunLikeHint(s: AiPlanSession): boolean {
  return isRunningLike(s.type) || s.type === "race" || s.type === "tempo";
}

function sessionMatchesRestHint(s: AiPlanSession): boolean {
  return s.type === "rest";
}

function narrowSessionsByHalf(half: string, sessions: AiPlanSession[]): AiPlanSession[] {
  if (sessions.length <= 1) return sessions;
  let pool = sessions;

  if (isRestHintInHalf(half)) {
    const r = pool.filter(sessionMatchesRestHint);
    if (r.length) pool = r;
  }
  if (isStrengthHintInHalf(half)) {
    const r = pool.filter(sessionMatchesStrengthHint);
    if (r.length) pool = r;
  }
  if (isRunLikeHintInHalf(half)) {
    const r = pool.filter((s) => !isRestHintInHalf(half) && sessionMatchesRunLikeHint(s));
    if (r.length) pool = r;
  }
  return pool;
}

function splitRelativeProseForTwoDays(
  norm: string,
  early: Date,
  late: Date,
  today: Date,
): { earlyH: string; lateH: string } {
  const t0 = startOfLocalDay(today).getTime();
  const earlyOff = Math.round((startOfLocalDay(early).getTime() - t0) / 86400000);
  const lateOff = Math.round((startOfLocalDay(late).getTime() - t0) / 86400000);
  const key = (off: number) =>
    off === -1
      ? "gestern"
      : off === 0
        ? "heute"
        : off === 1
          ? "morgen"
          : off === 2
            ? "ubermorgen"
            : null;
  const ke = key(earlyOff);
  const kl = key(lateOff);
  if (ke && kl && norm.includes(ke) && norm.includes(kl)) {
    const i = norm.indexOf(ke);
    const j = norm.indexOf(kl);
    if (i >= 0 && j >= 0) {
      if (i < j) return { earlyH: norm.slice(0, j), lateH: norm.slice(j) };
      return { earlyH: norm.slice(0, i), lateH: norm.slice(i) };
    }
  }
  const wdE = dowNumberToGermanName(startOfLocalDay(early).getDay());
  const wdL = dowNumberToGermanName(startOfLocalDay(late).getDay());
  if (wdE && wdL && norm.includes(wdE) && norm.includes(wdL)) {
    const i = norm.indexOf(wdE);
    const j = norm.indexOf(wdL);
    if (i >= 0 && j >= 0) {
      if (i < j) return { earlyH: norm.slice(0, j), lateH: norm.slice(j) };
      return { earlyH: norm.slice(0, i), lateH: norm.slice(i) };
    }
  }
  return { earlyH: norm, lateH: norm };
}

function tryResolveMitHalvesSwap(plan: AiPlanWeek[], norm: string, today: Date): ResolveSwapResult | null {
  if (!/\bmit\b/.test(norm)) return null;
  const parts = norm.split(/\bmit\b/);
  if (parts.length < 2) return null;
  const left = parts[0] ?? "";
  const right = parts.slice(1).join("mit");
  const dayLeft = inferCalendarDayForPhrase(left, today);
  const dayRight = inferCalendarDayForPhrase(right, today);
  if (!dayLeft || !dayRight) return null;
  if (startOfLocalDay(dayLeft).getTime() === startOfLocalDay(dayRight).getTime()) return null;

  /** Chronological «source» = earlier calendar day — matches two-day relative path + legacy scorer. */
  const leftFirst = startOfLocalDay(dayLeft).getTime() <= startOfLocalDay(dayRight).getTime();
  const sourceDay = leftFirst ? dayLeft : dayRight;
  const targetDay = leftFirst ? dayRight : dayLeft;
  const sourceHalf = leftFirst ? left : right;
  const targetHalf = leftFirst ? right : left;

  const earlyPool = sessionsOnLocalCalendarDay(plan, sourceDay);
  const latePool = sessionsOnLocalCalendarDay(plan, targetDay);
  const srcNarrow = narrowSessionsByHalf(sourceHalf, earlyPool);
  const tgtNarrow = narrowSessionsByHalf(targetHalf, latePool);

  if (!srcNarrow.length) {
    return { status: "not_found", source: null, target: null, reason: "source_not_found" };
  }
  if (!tgtNarrow.length) {
    return { status: "not_found", source: null, target: null, reason: "target_not_found" };
  }
  if (srcNarrow.length > 1 || tgtNarrow.length > 1) {
    return {
      status: "ambiguous",
      source: null,
      target: null,
      sourceCandidates: srcNarrow.slice(0, 5),
      targetCandidates: tgtNarrow.slice(0, 5),
    };
  }

  const source = srcNarrow[0];
  const target = tgtNarrow[0];
  if (source.id === target.id) {
    return { status: "not_found", source: null, target: null, reason: "both_not_found" };
  }
  const confidence: "high" | "low" = source.type === "rest" || target.type === "rest" ? "low" : "high";
  return { status: "ok", source, target, confidence };
}

function tryResolveAbsoluteOrderedTwoDaySwap(
  plan: AiPlanWeek[],
  norm: string,
  today: Date,
): ResolveSwapResult | null {
  const hits = extractOrderedAbsoluteDates(norm, today);
  if (hits.length < 2) return null;

  const splitIdx = hits[1].idx;
  const tagged = [
    { d: hits[0].d, text: norm.slice(0, splitIdx) },
    { d: hits[1].d, text: norm.slice(splitIdx) },
  ].sort((a, b) => startOfLocalDay(a.d).getTime() - startOfLocalDay(b.d).getTime());

  const poolA = sessionsOnLocalCalendarDay(plan, tagged[0].d);
  const poolB = sessionsOnLocalCalendarDay(plan, tagged[1].d);

  let useA = narrowSessionsByHalf(tagged[0].text, poolA);
  if (!useA.length) useA = poolA;
  let useB = narrowSessionsByHalf(tagged[1].text, poolB);
  if (!useB.length) useB = poolB;

  if (!useA.length) return { status: "not_found", source: null, target: null, reason: "source_not_found" };
  if (!useB.length) return { status: "not_found", source: null, target: null, reason: "target_not_found" };
  if (useA.length > 1 || useB.length > 1) {
    return {
      status: "ambiguous",
      source: null,
      target: null,
      sourceCandidates: useA.slice(0, 5),
      targetCandidates: useB.slice(0, 5),
    };
  }

  const source = useA[0];
  const target = useB[0];
  if (source.id === target.id) {
    return { status: "not_found", source: null, target: null, reason: "both_not_found" };
  }
  const confidence: "high" | "low" = source.type === "rest" || target.type === "rest" ? "low" : "high";
  return { status: "ok", source, target, confidence };
}

/**
 * When the user names two relative days (e.g. heute+morgen) and there is no «two weekday names» pattern,
 * pick the plan row on each calendar day (rest rows included). Two sessions on the same day → ambiguous.
 */
function tryResolveRelativeTwoDaySwap(
  plan: AiPlanWeek[],
  norm: string,
  today: Date,
): ResolveSwapResult | null {
  const pair = inferTwoDistinctRelativeCalendarDays(norm, today);
  if (!pair) return null;

  const { earlyH, lateH } = splitRelativeProseForTwoDays(norm, pair.early, pair.late, today);
  let earlySessions = sessionsOnLocalCalendarDay(plan, pair.early);
  let lateSessions = sessionsOnLocalCalendarDay(plan, pair.late);
  const earlyN = narrowSessionsByHalf(earlyH, earlySessions);
  const lateN = narrowSessionsByHalf(lateH, lateSessions);
  if (earlyN.length) earlySessions = earlyN;
  if (lateN.length) lateSessions = lateN;

  if (earlySessions.length === 0) {
    return { status: "not_found", source: null, target: null, reason: "source_not_found" };
  }
  if (lateSessions.length === 0) {
    return { status: "not_found", source: null, target: null, reason: "target_not_found" };
  }
  if (earlySessions.length > 1 || lateSessions.length > 1) {
    return {
      status: "ambiguous",
      source: null,
      target: null,
      sourceCandidates: earlySessions.slice(0, 5),
      targetCandidates: lateSessions.slice(0, 5),
    };
  }

  const source = earlySessions[0];
  const target = lateSessions[0];
  if (source.id === target.id) {
    return { status: "not_found", source: null, target: null, reason: "both_not_found" };
  }

  // Nur UI-Hinweis („niedrige Sicherheit“); Confidence „low“ blockiert keine Tausche.
  const confidence: "high" | "low" =
    source.type === "rest" || target.type === "rest" ? "low" : "high";

  return { status: "ok", source, target, confidence };
}

/** First occurrences in reading order — unique weekdays. */
function extractGermanWeekdaysInOrder(norm: string): number[] {
  const nameToDow: Record<string, number> = {
    sonntag: 0,
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
    samstag: 6,
  };
  const re = /\b(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/g;
  const seen = new Set<number>();
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const dow = nameToDow[m[1]];
    if (dow === undefined) continue;
    if (seen.has(dow)) continue;
    seen.add(dow);
    out.push(dow);
  }
  return out;
}

function collectAnchorKeySet(norm: string, today: Date): Set<number> {
  const keys = new Set<number>();
  const add = (d: Date) => keys.add(startOfLocalDay(d).getTime());
  for (const h of extractOrderedAbsoluteDates(norm, today)) {
    add(h.d);
  }
  if (/\bgestern\b/.test(norm)) add(calendarDayFromOffset(today, -1));
  if (/\bheute\b/.test(norm)) add(calendarDayFromOffset(today, 0));
  if (/\bmorgen\b/.test(norm)) add(calendarDayFromOffset(today, 1));
  if (/\bubermorgen\b/.test(norm)) add(calendarDayFromOffset(today, 2));
  for (const dow of extractGermanWeekdaysInOrder(norm)) {
    add(expectedAnchoredCalendarDay(norm, today, dow));
  }
  return keys;
}

function needsSecondAnchorPrompt(norm: string, today: Date): boolean {
  if (!hasSwapVerbNorm(norm)) return false;
  if (resolveWeekWindow(norm, today)) return false;
  if (/\b(naechste|nachste|kommende)\s+woche\b/.test(norm)) return false;
  return collectAnchorKeySet(norm, today).size === 1;
}

function needsDatesForTypePrompt(norm: string, today: Date): boolean {
  if (!hasSwapVerbNorm(norm)) return false;
  if (resolveWeekWindow(norm, today)) return false;
  if (/\b(naechste|nachste|kommende)\s+woche\b/.test(norm)) return false;
  if (collectAnchorKeySet(norm, today).size > 0) return false;
  return /\b(kraft|krafttraining|strength|gym|intervall|lang|tempo|ruhetag|rennrad|lauf|laufen)\b/.test(norm);
}

type ScoreCtx = {
  l: string;
  today: Date;
  weekWindow: WeekWindow | null;
  /** Mo..So for «Dienstag mit Donnerstag» in same week anchor */
  pairedSourceDow: number | null;
  pairedTargetDow: number | null;
  /** «heute» + ein Wochentag */
  useTodayAsSource: boolean;
  singleNamedTargetDow: number | null;
};

function buildScoreCtx(raw: string, today: Date): ScoreCtx {
  const l = normalizeText(raw);
  const weekWindow = resolveWeekWindow(l, today);
  const orderedWd = extractGermanWeekdaysInOrder(l);
  let pairedSourceDow: number | null = null;
  let pairedTargetDow: number | null = null;
  /** «heute» + höchstens ein Wochentag (Zero: z. B. «… mit Rennrad nächste Woche»). */
  const useTodayAsSource = l.includes("heute") && orderedWd.length <= 1;
  let singleNamedTargetDow: number | null = null;
  if (orderedWd.length >= 2) {
    pairedSourceDow = orderedWd[0];
    pairedTargetDow = orderedWd[1];
  } else if (orderedWd.length === 1) {
    singleNamedTargetDow = orderedWd[0];
  }
  return { l, today, weekWindow, pairedSourceDow, pairedTargetDow, useTodayAsSource, singleNamedTargetDow };
}

function expectedAnchoredCalendarDay(normalizedRaw: string, anchor: Date, targetDow: number): Date {
  const t = startOfLocalDay(anchor);
  const cur = t.getDay();
  let add = (targetDow - cur + 7) % 7;
  const wantsLaterSameWeekday =
    /\b(?:naechst|nachst|kommend)\w*\b|\bnext\b|\bfollowing\b/.test(normalizedRaw);
  if (add === 0 && wantsLaterSameWeekday) add = 7;
  const out = new Date(t);
  out.setDate(out.getDate() + add);
  return out;
}

function inWeekWindow(d: Date, w: WeekWindow | null): boolean {
  if (!w) return true;
  const t = startOfLocalDay(d).getTime();
  return t >= w.start.getTime() && t < w.endExclusive.getTime();
}

function scoreSession(session: AiPlanSession, raw: string, goal: "source" | "target", ctx: ScoreCtx): number {
  const l = ctx.l;
  const today = ctx.today;
  let score = 0;

  const sessionDate = parseSessionDateLabel(session.date);
  if (!sessionDate) return -999;
  const sessionDay = startOfLocalDay(sessionDate);

  if (ctx.weekWindow && !inWeekWindow(sessionDay, ctx.weekWindow)) {
    const allowTodaySourceOutsideWindow =
      goal === "source" && ctx.l.includes("heute") && isSameLocalDay(sessionDay, today);
    if (!allowTodaySourceOutsideWindow) return -998;
  }

  const wantsBike = l.includes("rennrad") || l.includes("rad") || l.includes("bike");
  const wantsRun = l.includes("lauf") || l.includes("laufen") || l.includes("run") || l.includes("jog");
  const wantsIntervals = l.includes("intervall") || l.includes("interval") || l.includes("tempo");

  if (wantsBike && session.type === "bike") score += 6;
  if (wantsBike && session.type !== "bike") score -= 6;
  if (wantsRun && isRunningLike(session.type)) score += 6;
  if (wantsRun && !isRunningLike(session.type) && session.type !== "rest") score -= 3;
  if (wantsIntervals && (session.type === "interval" || session.type === "tempo")) score += 3;

  const hintedKm = parseDistanceHintKm(l);
  if (hintedKm != null && typeof session.km === "number" && Number.isFinite(session.km) && session.km > 0) {
    const diff = Math.abs(session.km - hintedKm);
    if (diff < 0.25) score += 4;
    else if (diff < 1.0) score += 2;
  }

  const diffDays = Math.round((sessionDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const pairMode = ctx.pairedSourceDow !== null && ctx.pairedTargetDow !== null;
  /** Paired weekdays: wenn Wochenfenster gesetzt (z. B. nächste Woche), bereits oben gefiltert. */
  if (pairMode) {
    const wantDow = goal === "source" ? ctx.pairedSourceDow : ctx.pairedTargetDow;
    if (wantDow !== null && sessionDay.getDay() === wantDow && session.type !== "rest") {
      score += 30;
    } else if (wantDow !== null && sessionDay.getDay() === wantDow) {
      score += 18;
    } else {
      score -= 14;
    }
    return score;
  }

  if (goal === "source") {
    if (ctx.useTodayAsSource) {
      if (isSameLocalDay(sessionDay, today)) score += 20;
      else score -= 12;
      return score;
    }
    const wantsToday = l.includes("heute");
    if (wantsToday && isSameLocalDay(sessionDay, today)) score += 8;
    score += Math.max(0, 6 - Math.abs(diffDays));
  } else {
    if (ctx.useTodayAsSource && ctx.singleNamedTargetDow !== null) {
      const expected = expectedAnchoredCalendarDay(l, today, ctx.singleNamedTargetDow);
      const gapDays = Math.round((sessionDay.getTime() - expected.getTime()) / 86400000);
      if (gapDays === 0) score += 25;
      else score += Math.max(-10, 8 - Math.abs(gapDays));
    } else if (!pairMode && ctx.singleNamedTargetDow !== null) {
      const expected = expectedAnchoredCalendarDay(l, today, ctx.singleNamedTargetDow);
      const gapDays = Math.round((sessionDay.getTime() - expected.getTime()) / 86400000);
      if (gapDays === 0) score += 25;
      else score += Math.max(-10, 8 - Math.abs(gapDays));
    } else {
      const minFutureDays = l.includes("morgen") ? 1 : 0;
      if (diffDays >= minFutureDays && diffDays > 0) score += Math.min(6, diffDays + 4);
      score += Math.max(0, 6 - Math.abs(diffDays - 7));
    }
  }

  if (session.type === "rest") score -= 6;

  return score;
}

function pickBest(
  scored: Array<{ session: AiPlanSession; score: number }>,
  threshold: number,
): { best: AiPlanSession | null; ambiguous: boolean; candidates: AiPlanSession[] } {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted.filter((s) => s.score >= threshold).slice(0, 5);
  if (!top.length) return { best: null, ambiguous: false, candidates: [] };
  if (top.length >= 2 && top[1].score >= top[0].score - 1) {
    return { best: null, ambiguous: true, candidates: top.map((t) => t.session) };
  }
  return { best: top[0].session, ambiguous: false, candidates: top.map((t) => t.session) };
}

export type ResolveSwapResult =
  | {
      status: "ok";
      source: AiPlanSession;
      target: AiPlanSession;
      confidence: "high" | "low";
    }
  | {
      status: "not_found";
      source: null;
      target: null;
      reason:
        | "source_not_found"
        | "target_not_found"
        | "both_not_found"
        | "needs_second_anchor"
        | "needs_dates_for_type";
    }
  | {
      status: "ambiguous";
      source: null;
      target: null;
      sourceCandidates: AiPlanSession[];
      targetCandidates: AiPlanSession[];
    };

export function resolveSwap(
  plan: AiPlanWeek[],
  raw: string,
  opts?: { now?: Date; threshold?: number },
): ResolveSwapResult {
  const now = opts?.now ?? getAppNow();
  const today = startOfLocalDay(now);
  const norm = normalizeText(raw);

  const mit = tryResolveMitHalvesSwap(plan, norm, today);
  if (mit) return mit;

  const abs = tryResolveAbsoluteOrderedTwoDaySwap(plan, norm, today);
  if (abs) return abs;

  const relative = tryResolveRelativeTwoDaySwap(plan, norm, today);
  if (relative) return relative;

  if (needsSecondAnchorPrompt(norm, today)) {
    return { status: "not_found", source: null, target: null, reason: "needs_second_anchor" };
  }
  if (needsDatesForTypePrompt(norm, today)) {
    return { status: "not_found", source: null, target: null, reason: "needs_dates_for_type" };
  }

  const ctx = buildScoreCtx(raw, today);

  let threshold = Number.isFinite(opts?.threshold as number) ? (opts?.threshold as number) : 8;
  if (ctx.weekWindow && ctx.pairedSourceDow !== null && ctx.pairedTargetDow !== null) threshold = 6;
  if (ctx.useTodayAsSource && ctx.singleNamedTargetDow !== null) threshold = 6;

  const all = plan.flatMap((w) => w.s);
  const scoredSource = all.map((session) => ({ session, score: scoreSession(session, raw, "source", ctx) }));
  const scoredTarget = all.map((session) => ({ session, score: scoreSession(session, raw, "target", ctx) }));

  const sourcePick = pickBest(scoredSource, threshold);
  const targetPick = pickBest(scoredTarget, threshold);

  if (sourcePick.ambiguous || targetPick.ambiguous) {
    return {
      status: "ambiguous",
      source: null,
      target: null,
      sourceCandidates: sourcePick.candidates,
      targetCandidates: targetPick.candidates,
    };
  }

  if (!sourcePick.best && !targetPick.best) {
    return { status: "not_found", source: null, target: null, reason: "both_not_found" };
  }
  if (!sourcePick.best) {
    return { status: "not_found", source: null, target: null, reason: "source_not_found" };
  }
  if (!targetPick.best) {
    return { status: "not_found", source: null, target: null, reason: "target_not_found" };
  }

  // Nur UI-Hinweis; blockiert keine Tausche (siehe tryResolveRelativeTwoDaySwap).
  const confidence: "high" | "low" =
    sourcePick.best.type === "rest" || targetPick.best.type === "rest" ? "low" : "high";

  return { status: "ok", source: sourcePick.best, target: targetPick.best, confidence };
}
