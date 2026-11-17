/**
 * Wochenvorschlag aus dem Dienstplan (Schicht-Modus, Spec §7.6, §8.4–§8.7) über die bestehende Engine:
 * Kandidaten und Ranking aus `buildCalendarReassignmentCandidates`/`rankCalendarReassignmentCandidates`, Batch-Prüfung
 * mit `validateWeekReassignmentBatch`. Zusätzlich die Schutzregeln, die hart ablehnen (nicht nur warnen):
 *   - keine zwei harten Tage hintereinander (harte Typen + Long Run, auch über die Wochengrenze), keine neuen
 *   - Long Run bleibt in seiner Kalenderwoche und hält `minDaysBetweenLongRuns` Abstand zu anderen Long Runs
 *   - Rennen nie Quelle oder Ziel; gesperrte Einheiten (erledigt/übersprungen/vergangen) nie
 *   - in Taper- und Rennwoche rückt keine harte Einheit auf einen späteren Tag
 * „Eingeschränkt“ ist ein weicher Konflikt: verschoben wird nur auf einen freien Tag. Gibt es für eine harte Einheit
 * auf einem ungeeigneten Tag keinen sicheren Tag, wird „locker statt hart“ (H3, Spec §8.2) vorgeschlagen — über
 * denselben Patch-Weg wie der Krankheits-Vorschlag (`PlanPatch` mit `type: "easy"`). Nichts wird ohne Bestätigung
 * geschrieben; das Ergebnis ist eine Aktion für die bestehende `AiActionCard`.
 */
import type { AiAssistantAction, AiPlanSession, AiPlanWeek, PlanPatch } from "../lib/ai/types";
import type { WeeklyScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";
import { applyPlanPatches } from "../lib/ai/actions";
import { deepClone } from "../core/deepClone";
import { addDays, diffDays, mondayOf } from "../planCore/dates";
import { CONFIG as READINESS_CONFIG } from "../readinessCore/config";
import type { ShiftCategory, ShiftDayAssessment } from "../readinessCore/shiftDays";
import {
  computeDayCapacityScore,
  computeSessionDayFitScore,
  shiftCategoryOfSession,
  shiftDayFitScore,
  type DayCapacityScore,
  type ShiftCapacityContext,
} from "../scheduling/capacityScore";
import { MIN_FIT_SCORE_THRESHOLD, rankCalendarReassignmentCandidates } from "../ai/mutations/assignSessionToBestCapacityDay";
import { buildCalendarReassignmentCandidates } from "../ai/mutations/buildCalendarReassignmentAction";
import type { WeekCalendarReassignmentProposal } from "../ai/mutations/proposeWeekCalendarReassignments";
import { validateWeekReassignmentBatch } from "../ai/mutations/validateWeekReassignmentBatch";
import { NO_LOCKED_SESSION_IDS } from "../ai/mutations/lockedSessions";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import { swapWorkouts } from "../ai/mutations/swapWorkouts";
import { dayLabelDe, moveSentenceDe, reasonPhraseDe, softenSentenceDe, weekdayLongDe } from "./shiftText";

/** Harte Tage für die Abstandsregel: wie `HIGH_INTENSITY_SESSION_TYPES` (Long Run zählt mit). */
const HARD_TYPES: readonly string[] = ["tempo", "interval", "race", "long"];

export function isHardDayType(type: string | undefined): boolean {
  return !!type && HARD_TYPES.indexOf(type) >= 0;
}

export type ShiftConflict = {
  sessionId: string;
  dayYmd: string;
  category: ShiftCategory;
  /** `strong` = Fit unter der Schwelle (ungeeignet/kein Fenster oder Kalenderkonflikt), `weak` = eingeschränkt. */
  severity: "strong" | "weak";
  fit: number;
  /** Dienstplan-Aussage des Tages (fehlt bei reinem Kalenderkonflikt). */
  shiftDay?: ShiftDayAssessment;
};

export type ShiftMove = { sessionId: string; fromYmd: string; toYmd: string; sentence: string; cause: string };
export type ShiftSoften = { sessionId: string; dayYmd: string; sentence: string; patch: PlanPatch };

export type ShiftWeekProposal =
  | { status: "no-conflicts" }
  | { status: "hint-only"; hints: string[]; conflicts: ShiftConflict[] }
  | { status: "blocked"; reasons: string[] }
  | {
      status: "proposal";
      action: AiAssistantAction;
      patches: PlanPatch[];
      moves: ShiftMove[];
      softened: ShiftSoften[];
      hints: string[];
      conflicts: ShiftConflict[];
    };

export type ProposeShiftWeekInput = {
  plan: AiPlanWeek[];
  weekIndex: number;
  scheduleBlocks: WeeklyScheduleBlock[];
  shiftContext: ShiftCapacityContext;
  todayYmd: string;
  lockedSessionIds?: ReadonlySet<string>;
};

function allSessions(plan: AiPlanWeek[]): AiPlanSession[] {
  const out: AiPlanSession[] = [];
  plan.forEach((week) => (week.s ?? []).forEach((s) => out.push(s)));
  return out;
}

function findSession(plan: AiPlanWeek[], id: string): AiPlanSession | null {
  for (const week of plan) for (const s of week.s ?? []) if (s.id === id) return s;
  return null;
}

/** Rennwoche: die Woche enthält das Rennen. Taper: Phase „taper“ (alle Schreibweisen) oder Rennwoche. */
export function isTaperOrRaceWeek(week: AiPlanWeek): boolean {
  if ((week.s ?? []).some((s) => s.type === "race")) return true;
  return /taper/i.test(String(week.phase ?? ""));
}

function isRaceWeek(week: AiPlanWeek): boolean {
  return (week.s ?? []).some((s) => s.type === "race");
}

/** Kalendertag → harte Einheit an diesem Tag? (über alle Wochen; Ruhetage und lockere Läufe zählen nicht) */
function hardDays(plan: AiPlanWeek[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  allSessions(plan).forEach((s) => {
    const ymd = sessionDayIso(s);
    if (ymd && isHardDayType(s.type)) out[ymd] = true;
  });
  return out;
}

/** Neue Paare harter Tage hintereinander, die es vorher nicht gab (geprüft an den Tagen der verschobenen Einheiten). */
export function newAdjacentHardDays(before: AiPlanWeek[], after: AiPlanWeek[], movedIds: string[]): string[] {
  const hardBefore = hardDays(before);
  const hardAfter = hardDays(after);
  const out: string[] = [];
  movedIds.forEach((id) => {
    const session = findSession(after, id);
    if (!session || !isHardDayType(session.type)) return;
    const ymd = sessionDayIso(session);
    if (!ymd) return;
    [addDays(ymd, -1), addDays(ymd, 1)].forEach((neighbor) => {
      const pairBefore = hardBefore[ymd] && hardBefore[neighbor];
      if (hardAfter[neighbor] && !pairBefore) out.push(`${ymd < neighbor ? ymd : neighbor}>${ymd < neighbor ? neighbor : ymd}`);
    });
  });
  return out;
}

/** Long Run aus seiner Kalenderwoche verschoben oder zu nah an einem anderen Long Run? */
export function longRunViolations(before: AiPlanWeek[], after: AiPlanWeek[], movedIds: string[]): string[] {
  const minGap = READINESS_CONFIG.actions.minDaysBetweenLongRuns.value;
  const out: string[] = [];
  const longAfter = allSessions(after).filter((s) => s.type === "long");
  movedIds.forEach((id) => {
    const b = findSession(before, id);
    const a = findSession(after, id);
    if (!b || !a || a.type !== "long") return;
    const from = sessionDayIso(b);
    const to = sessionDayIso(a);
    if (!from || !to || from === to) return;
    if (mondayOf(from) !== mondayOf(to)) out.push(`long-run-week:${id}`);
    longAfter.forEach((other) => {
      if (other.id === id) return;
      const otherYmd = sessionDayIso(other);
      if (otherYmd && Math.abs(diffDays(otherYmd, to)) < minGap) out.push(`long-run-gap:${id}>${other.id}`);
    });
  });
  return out;
}

/**
 * In Taper-/Rennwoche: keine harte Einheit auf einen späteren Tag.
 * ENTSCHEIDUNG (Anton absegnen): Spec §8.7 sieht in der Rennwoche gar keine planändernden Vorschläge vor; Plan W1
 * erlaubt „nur auf frühere Tage“. Umgesetzt ist W1 (Verschieben nach vorn erlaubt, „locker statt hart“ nicht).
 */
function taperViolations(week: AiPlanWeek, before: AiPlanWeek[], after: AiPlanWeek[], movedIds: string[]): string[] {
  if (!isTaperOrRaceWeek(week)) return [];
  const out: string[] = [];
  movedIds.forEach((id) => {
    const b = findSession(before, id);
    const a = findSession(after, id);
    if (!b || !a || !isHardDayType(a.type)) return;
    const from = sessionDayIso(b);
    const to = sessionDayIso(a);
    if (from && to && to > from) out.push(`taper-later:${id}`);
  });
  return out;
}

function suitabilityOf(capacity: DayCapacityScore, category: ShiftCategory | null) {
  if (!capacity.shift || !category) return null;
  return category === "hard" ? capacity.shift.hard : category === "long" ? capacity.shift.long : capacity.shift.easy;
}

/** Konflikte der Woche: harte (Fit < 0,35) und weiche (Dienstplan „eingeschränkt“ für hart/Long Run). */
export function findShiftConflicts(
  week: AiPlanWeek,
  scheduleBlocks: WeeklyScheduleBlock[],
  shiftContext: ShiftCapacityContext,
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
): ShiftConflict[] {
  const out: ShiftConflict[] = [];
  (week.s ?? []).forEach((session) => {
    if (lockedSessionIds.has(session.id) || session.type === "race" || session.type === "rest") return;
    const dayYmd = sessionDayIso(session);
    const category = shiftCategoryOfSession(session);
    if (!dayYmd || !category) return;
    const capacity = computeDayCapacityScore(dayYmd, scheduleBlocks, shiftContext);
    const fit = computeSessionDayFitScore(session, capacity);
    const base = { sessionId: session.id, dayYmd, category, fit, ...(capacity.shift ? { shiftDay: capacity.shift } : {}) };
    if (fit < MIN_FIT_SCORE_THRESHOLD) out.push({ ...base, severity: "strong" });
    else if (category !== "easy" && suitabilityOf(capacity, category) === "limited") out.push({ ...base, severity: "weak" });
  });
  return out.sort((a, b) =>
    a.severity !== b.severity ? (a.severity === "strong" ? -1 : 1) : a.fit !== b.fit ? a.fit - b.fit : a.sessionId.localeCompare(b.sessionId),
  );
}

/** H3 „locker statt hart“: gleiche Einheit, Typ locker, höchstens so lang wie geplant und ~60 min (Spec §8.2). */
export function buildSoftenPatch(session: AiPlanSession, reason: string): PlanPatch {
  const maxKm = Math.floor(READINESS_CONFIG.actions.easyInsteadMaxMinutes.value / READINESS_CONFIG.load.fallbackPaceMinPerKm.value);
  const km = Number.isFinite(session.km) && session.km > 0 ? Math.max(1, Math.min(Math.round(session.km), maxKm)) : maxKm;
  return {
    sessionId: session.id,
    changes: {
      type: "easy",
      kind: "E",
      title: "Lockerer Lauf",
      km,
      pace: "locker",
      desc: `Statt „${session.title}“: ruhig laufen, Puls niedrig halten – ${reason}.`,
    },
    reason: "Schicht-Modus: locker statt hart",
  };
}

function dayCapacity(ymd: string, blocks: WeeklyScheduleBlock[], ctx: ShiftCapacityContext): DayCapacityScore {
  return computeDayCapacityScore(ymd, blocks, ctx);
}

/** Ziel ist „frei“ für diese Art (Dienstplan frei oder ohne Aussage) und ohne Kalenderkonflikt. */
function isFreeFor(session: AiPlanSession, capacity: DayCapacityScore): boolean {
  const category = shiftCategoryOfSession(session);
  if (!category) return true;
  const suit = suitabilityOf(capacity, category);
  if (suit && suit !== "free") return false;
  return computeSessionDayFitScore(session, capacity) >= MIN_FIT_SCORE_THRESHOLD;
}

type GreedyResult = {
  proposals: WeekCalendarReassignmentProposal[];
  moves: ShiftMove[];
  softened: ShiftSoften[];
  hints: string[];
};

type GreedyArgs = ProposeShiftWeekInput & { locked: ReadonlySet<string>; week: AiPlanWeek; conflictIds: Record<string, boolean> };

function runGreedy(args: GreedyArgs, order: ShiftConflict[]): GreedyResult {
  const { plan, weekIndex, scheduleBlocks, shiftContext, todayYmd, locked, week, conflictIds } = args;
  let current: AiPlanWeek[] = deepClone(plan);
  const used: Record<string, boolean> = {};
  const proposals: WeekCalendarReassignmentProposal[] = [];
  const moves: ShiftMove[] = [];
  const softened: ShiftSoften[] = [];
  const hints: string[] = [];
  const raceWeek = isRaceWeek(week);

  order.forEach((conflict) => {
    const currentWeek = current[weekIndex];
    const session = findSession(current, conflict.sessionId);
    if (!session) return;
    const sourceCapacity = dayCapacity(conflict.dayYmd, scheduleBlocks, shiftContext);
    const candidates = buildCalendarReassignmentCandidates(currentWeek, conflict.sessionId, scheduleBlocks, locked, shiftContext).filter(
      (c) => !used[c.targetSessionId] && !conflictIds[c.targetSessionId],
    );
    const ranked = rankCalendarReassignmentCandidates([currentWeek], conflict.sessionId, candidates, sourceCapacity);

    let accepted: { toYmd: string; targetId: string; after: AiPlanWeek[] } | null = null;
    for (const candidate of ranked) {
      if (candidate.isConflict) continue;
      const target = findSession(current, candidate.targetSessionId);
      if (!target || target.type === "race" || locked.has(target.id)) continue;
      const targetCapacity = dayCapacity(candidate.dateIso, scheduleBlocks, shiftContext);
      // Zieltag muss für die verschobene Einheit frei sein; die verdrängte muss auf dem Quelltag passen.
      if (!isFreeFor(session, targetCapacity)) continue;
      if (isHardDayType(target.type) && !isFreeFor(target, sourceCapacity)) continue;
      if (computeSessionDayFitScore(target, sourceCapacity) < MIN_FIT_SCORE_THRESHOLD) continue;
      const after = swapWorkouts(current, session.id, target.id);
      const moved = [session.id, target.id];
      const problems = [
        ...newAdjacentHardDays(current, after, moved),
        ...longRunViolations(current, after, moved),
        ...taperViolations(week, current, after, moved),
      ];
      if (problems.length > 0) continue;
      accepted = { toYmd: candidate.dateIso, targetId: target.id, after };
      break;
    }

    if (accepted) {
      used[session.id] = true;
      used[accepted.targetId] = true;
      current = accepted.after;
      const cause = conflict.shiftDay ? reasonPhraseDe(conflict.shiftDay, conflict.category) : "wegen Kalendertermin";
      const toDay = shiftContext.byDate[accepted.toYmd];
      const sentence = conflict.shiftDay
        ? moveSentenceDe({
            sessionType: session.type,
            fromDay: conflict.shiftDay,
            fromYmd: conflict.dayYmd,
            toYmd: accepted.toYmd,
            toDay,
            todayYmd,
            category: conflict.category,
            limited: conflict.severity === "weak",
          })
        : `„${session.title}“ am ${weekdayLongDe(conflict.dayYmd)} kollidiert mit einem Termin. Vorschlag: ${weekdayLongDe(accepted.toYmd)}.`;
      proposals.push({ sessionId: session.id, fromDayIso: conflict.dayYmd, toDayIso: accepted.toYmd, reason: sentence, cause });
      moves.push({ sessionId: session.id, fromYmd: conflict.dayYmd, toYmd: accepted.toYmd, sentence, cause });
      return;
    }

    // Kein sicherer Tag.
    const shiftFit = shiftDayFitScore(session, sourceCapacity);
    const shiftUnsuitable = shiftFit != null && shiftFit < MIN_FIT_SCORE_THRESHOLD;
    if (conflict.severity === "strong" && shiftUnsuitable && conflict.shiftDay && (session.type === "interval" || session.type === "tempo") && !raceWeek) {
      // ENTSCHEIDUNG (Anton absegnen): H3 „locker statt hart“ auch im Wochenvorschlag (nicht nur für heute), nur für
      // Intervalle/Tempo auf ungeeigneten Tagen, nie für Long Run (wird laut §8.5 nie gestrichen) und nie in der Rennwoche.
      const reason = reasonPhraseDe(conflict.shiftDay, "hard");
      used[session.id] = true;
      softened.push({
        sessionId: session.id,
        dayYmd: conflict.dayYmd,
        sentence: softenSentenceDe({ sessionType: session.type, fromDay: conflict.shiftDay, fromYmd: conflict.dayYmd, todayYmd }),
        patch: buildSoftenPatch(session, reason),
      });
      return;
    }
    if (conflict.shiftDay) {
      const lead = reasonPhraseDe(conflict.shiftDay, conflict.category);
      hints.push(`${dayLabelDe(conflict.dayYmd)}: „${session.title}“ bleibt – ${lead}, und es gibt keinen freien Tag ohne Regelverstoß.`);
    } else {
      hints.push(`${dayLabelDe(conflict.dayYmd)}: Kalenderkonflikt ohne sicheren Ausweichtag – einzeln über den Kalender-Button bearbeiten.`);
    }
  });

  return { proposals, moves, softened, hints };
}

/** Alle Reihenfolgen (bis `limit` Konflikte; darüber nur die Standard-Reihenfolge). */
function orders<T>(items: T[], limit: number): T[][] {
  if (items.length <= 1 || items.length > limit) return [items];
  const out: T[][] = [];
  const walk = (rest: T[], acc: T[]) => {
    if (rest.length === 0) {
      out.push(acc);
      return;
    }
    rest.forEach((item, i) => walk(rest.slice(0, i).concat(rest.slice(i + 1)), acc.concat([item])));
  };
  walk(items, []);
  return out;
}

/** Reihenfolgen probieren, solange nicht alles verschoben ist: zuerst die meisten Verschiebungen, dann die wenigsten „locker statt hart“. */
const MAX_PERMUTED_CONFLICTS = 4;

/**
 * Wochenvorschlag für `plan[weekIndex]`. Greedy wie `proposeWeekCalendarReassignments` (schwerster Konflikt zuerst),
 * aber jede Einheit ist höchstens einmal beteiligt und jeder Tausch wird gegen den bisher angenommenen Stand geprüft.
 */
export function proposeShiftWeek(input: ProposeShiftWeekInput): ShiftWeekProposal {
  const { plan, weekIndex, scheduleBlocks, shiftContext } = input;
  const locked = input.lockedSessionIds ?? NO_LOCKED_SESSION_IDS;
  const week = plan[weekIndex];
  if (!week) return { status: "no-conflicts" };

  const conflicts = findShiftConflicts(week, scheduleBlocks, shiftContext, locked);
  if (conflicts.length === 0) return { status: "no-conflicts" };

  const conflictIds: Record<string, boolean> = {};
  conflicts.forEach((c) => (conflictIds[c.sessionId] = true));
  const original: AiPlanWeek[] = deepClone(plan);
  const args: GreedyArgs = { ...input, locked, week, conflictIds };

  let best = runGreedy(args, conflicts);
  if (best.moves.length < conflicts.length) {
    orders(conflicts, MAX_PERMUTED_CONFLICTS).forEach((order) => {
      if (best.moves.length === conflicts.length) return;
      const next = runGreedy(args, order);
      if (next.moves.length > best.moves.length || (next.moves.length === best.moves.length && next.softened.length < best.softened.length)) best = next;
    });
  }
  const { proposals, moves, softened, hints } = best;

  if (proposals.length === 0 && softened.length === 0) return { status: "hint-only", hints, conflicts };

  const validation = validateWeekReassignmentBatch(proposals, original[weekIndex], undefined, locked);
  if (!validation.valid) return { status: "blocked", reasons: validation.violations };

  const softenPatches = softened.map((s) => s.patch);
  const patches = [...validation.patches, ...softenPatches];

  // Letzte Sicherung über den ganzen Plan: angenommen wird nur, was keine Schutzregel bricht.
  const finalPlan = applyPlanPatches(deepClone(original), patches);
  const touched = validation.patches.map((p) => p.sessionId);
  const finalProblems = [
    ...newAdjacentHardDays(original, finalPlan, touched),
    ...longRunViolations(original, finalPlan, touched),
    ...taperViolations(week, original, finalPlan, touched),
  ];
  if (finalProblems.length > 0) return { status: "blocked", reasons: finalProblems };

  const items: string[] = [];
  moves
    .slice()
    .sort((a, b) => a.fromYmd.localeCompare(b.fromYmd))
    .forEach((m) => items.push(m.sentence));
  softened.forEach((s) => items.push(s.sentence));
  validation.patches.forEach((patch) => {
    const base = findSession(original, patch.sessionId);
    if (!base) return;
    const move = moves.find((m) => m.sessionId === patch.sessionId);
    items.push(`${base.title}: ${base.day} → ${patch.changes.day ?? base.day} (${patch.changes.date ?? base.date})${move ? ` – ${move.cause}` : ""}`);
  });
  softened.forEach((s) => {
    const base = findSession(original, s.sessionId);
    if (!base) return;
    items.push(`${base.title} (${base.day}) → ${s.patch.changes.title} ${s.patch.changes.km} km`);
  });
  if (validation.warning) items.push(`Hinweis: ${validation.warning}`);
  hints.forEach((h) => items.push(h));

  const action: AiAssistantAction = {
    type: "reassign_week_calendar_batch",
    payload: { source: "shift", proposals, softened: softened.map((s) => s.sessionId) },
    preview: {
      title: "Woche an deinen Dienstplan anpassen",
      items,
      confirmLabel: "Übernehmen",
      cancelLabel: "Verwerfen",
    },
  };
  return { status: "proposal", action, patches, moves, softened, hints, conflicts };
}
