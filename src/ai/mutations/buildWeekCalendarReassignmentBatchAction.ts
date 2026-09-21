import type { AiPlanWeek, AiAssistantAction, AiActionPreview } from "../../lib/ai/types";
import type { WeekCalendarReassignmentProposal } from "./proposeWeekCalendarReassignments";
import type { WeekReassignmentBatchResult } from "./validateWeekReassignmentBatch";
import { findSessionById } from "./assignSessionToBestCapacityDay";

/**
 * Turns a validated week-batch (Schritt 1-3) into a proposal-only `AiAssistantAction` for
 * `AiActionCard` — docks onto it the same way `buildCalendarReassignmentAction` docks the
 * single-session flow. `null` when there is nothing to confirm: either the batch was hard-blocked
 * (structural violation — caller shows `validation.violations` instead) or every conflict stayed
 * unresolved (no patches were produced, caller shows the unresolved count as an info message).
 */
export function buildWeekCalendarReassignmentBatchAction(
  proposals: WeekCalendarReassignmentProposal[],
  validation: WeekReassignmentBatchResult,
  week: AiPlanWeek,
): AiAssistantAction | null {
  if (!validation.valid || validation.patches.length === 0) return null;

  // Nur aufgelöste Vorschläge: eine ungelöste Konflikt-Session kann als verdrängte Session in einem
  // anderen Tausch stecken und darf dort nicht den eigenen Grund tragen.
  const causeBySourceSessionId = new Map<string, string>();
  for (const proposal of proposals) {
    if ("toDayIso" in proposal && proposal.cause) causeBySourceSessionId.set(proposal.sessionId, proposal.cause);
  }

  const items: string[] = [];
  for (const patch of validation.patches) {
    const base = findSessionById([week], patch.sessionId);
    if (!base) continue;
    const newDay = patch.changes.day ?? base.day;
    const newDate = patch.changes.date ?? base.date;
    const cause = causeBySourceSessionId.get(patch.sessionId);
    items.push(`${base.title}: ${base.day} → ${newDay} (${newDate})${cause ? ` – ${cause}` : ""}`);
  }
  if (items.length === 0) return null;

  if (validation.warning) {
    items.push(`⚠️ ${validation.warning}`);
  }

  const unresolvedCount = proposals.filter((p) => "unresolved" in p).length;
  if (unresolvedCount > 0) {
    items.push(
      `${unresolvedCount} Konflikt${unresolvedCount === 1 ? "" : "e"} nicht automatisch lösbar – einzeln über 📅 bearbeiten.`,
    );
  }

  const preview: AiActionPreview = {
    title: "Woche an Kalender anpassen",
    items,
    confirmLabel: "Übernehmen",
    cancelLabel: "Abbrechen",
  };

  return {
    type: "reassign_week_calendar_batch",
    payload: { proposals },
    preview,
  };
}
