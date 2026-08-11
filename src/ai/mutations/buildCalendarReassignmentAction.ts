import type { AiPlanWeek, AiPlanSession, AiAssistantAction, AiActionPreview } from "../../lib/ai/types";
import type { SessionAssignmentCandidate, SessionAssignmentResult } from "./assignSessionToBestCapacityDay";
import type { WeeklyScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { computeDayCapacityScore } from "../../scheduling/capacityScore";
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
 * are skipped defensively rather than passed to `computeDayCapacityScore` with a bogus date.
 */
export function buildCalendarReassignmentCandidates(
  week: AiPlanWeek,
  sessionId: string,
  blocks: WeeklyScheduleBlock[],
): SessionAssignmentCandidate[] {
  const candidates: SessionAssignmentCandidate[] = [];
  for (const session of week.s ?? []) {
    if (session.id === sessionId) continue;
    const dateIso = sessionDateIso(session);
    if (!dateIso) continue;
    candidates.push({ targetSessionId: session.id, capacity: computeDayCapacityScore(dateIso, blocks) });
  }
  return candidates;
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
