/**
 * Einzel-Pfad des Schicht-Modus (Kalender-Knopf an einer Einheit bzw. „An Kalender anpassen“ in der Detailansicht).
 *
 * Bei aktivem Dienstplan läuft der Einzel-Vorschlag durch dieselben Schutzregeln wie der Wochenvorschlag
 * (`checkCandidate` aus `proposeShiftWeek.ts`): Zieltag frei (bei ungeeignetem Ausgangstag ersatzweise eingeschränkt), keine neuen harten Tage in Folge, Long Run in seiner Woche
 * mit Abstand, Taper/Rennwoche nur früher, Rennen und gesperrte Einheiten nie Quelle oder Ziel. Die alte Engine
 * (`proposeSingleSessionCalendarReassignment`) bekommt den Dienstplan nicht, weil sie diese Regeln nur als Warnung kennt.
 * Auch die Liste für „Trotzdem Tag wählen“ enthält nur Tage, die die harten Regeln einhalten.
 */
import type { AiAssistantAction, AiPlanSession, AiPlanWeek, PlanPatch } from "../lib/ai/types";
import type { WeeklyScheduleBlock } from "../lib/supabase/services/weeklyScheduleBlocksService";
import { applyPlanPatches } from "../lib/ai/actions";
import { deepClone } from "../core/deepClone";
import type { ShiftCapacityContext } from "../scheduling/capacityScore";
import { diffToPatches, rankCalendarReassignmentCandidates } from "../ai/mutations/assignSessionToBestCapacityDay";
import {
  buildCalendarReassignmentCandidateViews,
  buildCalendarReassignmentCandidates,
  type CalendarReassignmentCandidateView,
} from "../ai/mutations/buildCalendarReassignmentAction";
import { NO_LOCKED_SESSION_IDS } from "../ai/mutations/lockedSessions";
import { sessionDayIso } from "../ai/mutations/sessionDayIso";
import { validatePlanIntegrity } from "../ai/validation/validatePlanIntegrity";
import { checkCandidate, closestFirst, dayCapacity, findShiftConflicts, type CheckedCandidate } from "./proposeShiftWeek";
import { moveSentenceDe, reasonPhraseDe, weekdayLongDe } from "./shiftText";

export type ShiftSingleProposal =
  | { status: "locked" }
  | { status: "no-conflict"; candidates: CalendarReassignmentCandidateView[]; source: "shift" }
  | {
      status: "proposal";
      action: AiAssistantAction | null;
      patches: PlanPatch[];
      candidates: CalendarReassignmentCandidateView[];
      conflictCause: string;
      source: "shift";
    };

export type ProposeShiftSingleInput = {
  plan: AiPlanWeek[];
  weekIndex: number;
  sessionId: string;
  scheduleBlocks: WeeklyScheduleBlock[];
  shiftContext: ShiftCapacityContext;
  todayYmd: string;
  lockedSessionIds?: ReadonlySet<string>;
};

function findIn(week: AiPlanWeek, id: string): AiPlanSession | null {
  return (week.s ?? []).find((s) => s.id === id) ?? null;
}

export function proposeShiftSingle(input: ProposeShiftSingleInput): ShiftSingleProposal {
  const { plan, sessionId, scheduleBlocks, shiftContext, todayYmd } = input;
  const locked = input.lockedSessionIds ?? NO_LOCKED_SESSION_IDS;
  const weekIndex = input.weekIndex >= 0 ? input.weekIndex : plan.findIndex((w) => !!findIn(w, sessionId));
  const week = plan[weekIndex];
  const session = week ? findIn(week, sessionId) : null;
  if (!week || !session || locked.has(sessionId) || session.type === "race") return { status: "locked" };

  const sourceYmd = sessionDayIso(session);
  const current: AiPlanWeek[] = deepClone(plan);
  const ctx = { scheduleBlocks, shiftContext, locked, week };
  const sourceCapacity = sourceYmd ? dayCapacity(sourceYmd, scheduleBlocks, shiftContext) : null;

  const candidates = buildCalendarReassignmentCandidates(week, sessionId, scheduleBlocks, locked, shiftContext);
  const ranked = sourceCapacity ? rankCalendarReassignmentCandidates([week], sessionId, candidates, sourceCapacity) : [];
  // Manuelle Wahl: nur Tage ohne Verstoß gegen eine harte Regel; „nicht frei“ bleibt sichtbar, aber als ungünstig markiert.
  const allowed = ranked
    .filter((c) => sourceCapacity && checkCandidate(ctx, current, session, sourceCapacity, c, false))
    .map((c) => ({ ...c, isConflict: c.isConflict || !(sourceCapacity && checkCandidate(ctx, current, session, sourceCapacity, c, true)) }));
  const views = buildCalendarReassignmentCandidateViews(week, allowed);

  const conflict = findShiftConflicts(week, scheduleBlocks, shiftContext, locked).find((c) => c.sessionId === sessionId);
  if (!conflict || !sourceCapacity || !sourceYmd) return { status: "no-conflict", candidates: views, source: "shift" };

  const conflictCause = conflict.shiftDay ? reasonPhraseDe(conflict.shiftDay, conflict.category) : "wegen Kalendertermin";
  let accepted: CheckedCandidate | null = null;
  const byCloseness = closestFirst(ranked, sourceYmd);
  for (const candidate of byCloseness) {
    accepted = checkCandidate(ctx, current, session, sourceCapacity, candidate, true);
    if (accepted) break;
  }
  // Wie im Wochenvorschlag: kein freier Tag → bei ungeeignetem Ausgangstag ein eingeschränkter Tag derselben Woche.
  if (!accepted && conflict.severity === "strong") {
    for (const candidate of byCloseness) {
      accepted = checkCandidate(ctx, current, session, sourceCapacity, candidate, true, true);
      if (accepted) break;
    }
  }
  if (!accepted) return { status: "proposal", action: null, patches: [], candidates: views, conflictCause, source: "shift" };

  const patches = diffToPatches(current, accepted.after, [sessionId, accepted.targetId]);
  if (patches.length === 0 || !validatePlanIntegrity(applyPlanPatches(deepClone(plan), patches))) {
    return { status: "proposal", action: null, patches: [], candidates: views, conflictCause, source: "shift" };
  }

  const sentence = conflict.shiftDay
    ? moveSentenceDe({
        sessionType: session.type,
        fromDay: conflict.shiftDay,
        fromYmd: sourceYmd,
        toYmd: accepted.toYmd,
        toDay: shiftContext.byDate[accepted.toYmd],
        todayYmd,
        category: conflict.category,
        limited: conflict.severity === "weak",
      })
    : `„${session.title}“ am ${weekdayLongDe(sourceYmd)} kollidiert mit einem Termin. Vorschlag: ${weekdayLongDe(accepted.toYmd)}.`;
  const items: string[] = [sentence];
  patches.forEach((patch) => {
    const base = findIn(week, patch.sessionId);
    if (!base) return;
    items.push(`${base.title}: ${base.day} → ${patch.changes.day ?? base.day} (${patch.changes.date ?? base.date})${patch.sessionId === sessionId ? ` – ${conflictCause}` : ""}`);
  });
  const action: AiAssistantAction = {
    type: "reassign_session_to_calendar",
    payload: { sessionId, targetSessionId: accepted.targetId, source: "shift" },
    preview: { title: "Einheit an deinen Dienstplan anpassen", items, confirmLabel: "Übernehmen", cancelLabel: "Abbrechen" },
  };
  return { status: "proposal", action, patches, candidates: views, conflictCause, source: "shift" };
}

/**
 * Manuelle Tageswahl („Trotzdem Tag wählen“) im Schicht-Modus: beim Antippen erneut gegen den aktuellen Plan prüfen
 * (harte Regeln, „frei“ nicht Pflicht). `false` = kein Tausch, die App zeigt den ruhigen Hinweis.
 */
export function isShiftChoiceAllowed(input: ProposeShiftSingleInput & { targetSessionId: string }): boolean {
  const locked = input.lockedSessionIds ?? NO_LOCKED_SESSION_IDS;
  const weekIndex = input.weekIndex >= 0 ? input.weekIndex : input.plan.findIndex((w) => !!findIn(w, input.sessionId));
  const week = input.plan[weekIndex];
  const session = week ? findIn(week, input.sessionId) : null;
  const target = week ? findIn(week, input.targetSessionId) : null;
  const sourceYmd = session ? sessionDayIso(session) : null;
  const targetYmd = target ? sessionDayIso(target) : null;
  if (!week || !session || !target || !sourceYmd || !targetYmd) return false;
  const sourceCapacity = dayCapacity(sourceYmd, input.scheduleBlocks, input.shiftContext);
  const ctx = { scheduleBlocks: input.scheduleBlocks, shiftContext: input.shiftContext, locked, week };
  return !!checkCandidate(ctx, deepClone(input.plan), session, sourceCapacity, { targetSessionId: target.id, dateIso: targetYmd, isConflict: false }, false);
}
