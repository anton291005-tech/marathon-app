import type { AiPlanWeek, AiPlanSession, AiAssistantAction, AiActionPreview, PlanPatch } from "../../lib/ai/types";
import type { SessionAssignmentCandidate, SessionAssignmentResult, RankedCalendarCandidate } from "./assignSessionToBestCapacityDay";
import {
  assignSessionToBestCapacityDay,
  isSessionInCalendarConflict,
  rankCalendarReassignmentCandidates,
} from "./assignSessionToBestCapacityDay";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";
import type { WeeklyScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { computeDayCapacityScore, type DayCapacityScore } from "../../scheduling/capacityScore";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppCalendarYmd } from "../../core/time/timeSystem";

function sessionDateIso(session: AiPlanSession): string | null {
  const parsed: Date | null = parseSessionDateLabel(session.date);
  if (!parsed) return null;
  return getAppCalendarYmd(parsed);
}

function findSessionById(plan: AiPlanWeek[], id: string): AiPlanSession | null {
  for (const week of plan) {
    for (const session of week.s ?? []) {
      if (session.id === id) return session;
    }
  }
  return null;
}

/**
 * Builds the N candidate days for `assignSessionToBestCapacityDay`: every other session in the
 * given week, scored by calendar capacity (Schritt 2). Sessions whose date label can't be parsed
 * are skipped defensively rather than passed to `computeDayCapacityScore` with a bogus date. Locked
 * sessions (done / skipped / past, see `buildLockedSessionIds`) are never a target.
 */
export function buildCalendarReassignmentCandidates(
  week: AiPlanWeek,
  sessionId: string,
  blocks: WeeklyScheduleBlock[],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
): SessionAssignmentCandidate[] {
  const candidates: SessionAssignmentCandidate[] = [];
  for (const session of week.s ?? []) {
    if (session.id === sessionId) continue;
    if (lockedSessionIds.has(session.id)) continue;
    const dateIso = sessionDateIso(session);
    if (!dateIso) continue;
    candidates.push({ targetSessionId: session.id, capacity: computeDayCapacityScore(dateIso, blocks) });
  }
  return candidates;
}

/**
 * Capacity of `sessionId`'s own (pre-swap) day — the slot a displaced candidate session would land
 * on. Feeds `assignSessionToBestCapacityDay`'s `sourceDayCapacity` so it can score both sides of a
 * swap, not just the clicked session's new day. `null` when the session isn't found or its date
 * can't be parsed, matching the defensive skip already used in `buildCalendarReassignmentCandidates`.
 */
export function computeSourceDayCapacity(
  week: AiPlanWeek,
  sessionId: string,
  blocks: WeeklyScheduleBlock[],
): DayCapacityScore | null {
  const session = findSessionById([week], sessionId);
  if (!session) return null;
  const dateIso = sessionDateIso(session);
  if (!dateIso) return null;
  return computeDayCapacityScore(dateIso, blocks);
}

/**
 * Turns a `SessionAssignmentResult` into a proposal-only `AiAssistantAction` for `AiActionCard` —
 * `null` when there's nothing to propose (engine failure or no-op). `result.warning` is appended
 * as an extra informational line (never blocks confirmation), matching the existing
 * "swaps are never hard-blocked, only surfaced as a hint" pattern used by
 * `buildSwapAthleteFacingWarnings`.
 */
export function buildCalendarReassignmentAction(
  sessionId: string,
  result: SessionAssignmentResult,
  beforePlan: AiPlanWeek[],
): AiAssistantAction | null {
  if (!result.ok || result.patches.length === 0) return null;

  const items: string[] = [];
  for (const patch of result.patches) {
    const base = findSessionById(beforePlan, patch.sessionId);
    if (!base) continue;
    const newDay = patch.changes.day ?? base.day;
    const newDate = patch.changes.date ?? base.date;
    items.push(`${base.title}: ${base.day} → ${newDay} (${newDate})`);
  }
  if (items.length === 0) return null;

  if (result.warning) {
    items.push(`⚠️ ${result.warning}`);
  }

  const preview: AiActionPreview = {
    title: "Trainingstag an Kalender anpassen",
    items,
    confirmLabel: "Übernehmen",
    cancelLabel: "Abbrechen",
  };

  return {
    type: "reassign_session_to_calendar",
    payload: { sessionId, targetSessionId: result.chosenTargetSessionId },
    preview,
  };
}

export type CalendarReassignmentCandidateView = {
  targetSessionId: string;
  label: string;
  isConflict: boolean;
  warningReason: string | null;
};

/**
 * Turns the engine's ranked candidates into display rows for the manual "Bearbeiten" day-picker —
 * one label per candidate day, built from the session that currently occupies it (same info shown
 * in the week list), plus the conflict flag from `rankCalendarReassignmentCandidates` so the UI can
 * mark it without hiding it.
 */
export function buildCalendarReassignmentCandidateViews(
  week: AiPlanWeek,
  ranked: RankedCalendarCandidate[],
): CalendarReassignmentCandidateView[] {
  return ranked.map((candidate) => {
    const session = (week.s ?? []).find((s) => s.id === candidate.targetSessionId);
    const label = session ? `${session.day} (${session.date}) – ${session.title}` : candidate.dateIso;
    return {
      targetSessionId: candidate.targetSessionId,
      label,
      isConflict: candidate.isConflict,
      warningReason: candidate.microStructureReason,
    };
  });
}

export type SingleSessionCalendarProposal =
  | { status: "locked" }
  | { status: "no-conflict"; candidates: CalendarReassignmentCandidateView[] }
  | { status: "proposal"; action: AiAssistantAction | null; patches: PlanPatch[]; candidates: CalendarReassignmentCandidateView[] };

/**
 * Einzel-Flow des 📅-Buttons: schlägt nur dann einen Tausch vor, wenn die Session auf ihrem aktuellen
 * Tag im Kalenderkonflikt ist (`isSessionInCalendarConflict`, dasselbe Kriterium wie der Wochen-Scan).
 * Ohne Konflikt (oder ohne parsebares Datum, wie im Scan) kommt `no-conflict` mit den Kandidaten für die
 * manuelle Tageswahl zurück — die bleibt also immer erreichbar. Gesperrte Sessions liefern `locked`.
 */
export function proposeSingleSessionCalendarReassignment(
  plan: AiPlanWeek[],
  week: AiPlanWeek,
  sessionId: string,
  blocks: WeeklyScheduleBlock[],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
): SingleSessionCalendarProposal {
  if (lockedSessionIds.has(sessionId)) return { status: "locked" };

  const candidates = buildCalendarReassignmentCandidates(week, sessionId, blocks, lockedSessionIds);
  const sourceDayCapacity = computeSourceDayCapacity(week, sessionId, blocks);
  const ranked = rankCalendarReassignmentCandidates(plan, sessionId, candidates, sourceDayCapacity);
  const candidateViews = buildCalendarReassignmentCandidateViews(week, ranked);

  const session = findSessionById([week], sessionId);
  const inConflict = !!session && !!sourceDayCapacity && isSessionInCalendarConflict(session, sourceDayCapacity);
  if (!inConflict) return { status: "no-conflict", candidates: candidateViews };

  const result = assignSessionToBestCapacityDay(plan, sessionId, candidates, sourceDayCapacity);
  const action = buildCalendarReassignmentAction(sessionId, result, plan);
  return { status: "proposal", action, patches: action ? result.patches : [], candidates: candidateViews };
}
