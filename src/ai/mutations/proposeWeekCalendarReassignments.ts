import type { AiPlanWeek } from "../../lib/ai/types";
import type { WeeklyScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import type { WeeklyCalendarConflict } from "./scanWeekForCalendarConflicts";
import { buildCalendarReassignmentCandidates, computeSourceDayCapacity } from "./buildCalendarReassignmentAction";
import { rankCalendarReassignmentCandidates } from "./assignSessionToBestCapacityDay";
import { computeSessionDayFitScore } from "../../scheduling/capacityScore";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";

export type WeekCalendarReassignmentProposal =
  | { sessionId: string; fromDayIso: string; toDayIso: string; reason: string; cause?: string }
  | { sessionId: string; fromDayIso: string; unresolved: true; reason: string; cause?: string };

function findSessionInWeek(week: AiPlanWeek, sessionId: string) {
  return (week.s ?? []).find((s) => s.id === sessionId) ?? null;
}

/**
 * Wie schwer der Konflikt ist: Fit-Score der Session auf ihrem eigenen (aktuellen) Tag – niedriger
 * = schwerer unterzubringen. Fehlt Session/Kapazität (bei Eingabe aus Schritt 1 ausgeschlossen),
 * wird 0 (am schwersten) angenommen statt die Sortierung stillschweigend zu verzerren.
 */
function conflictFitScore(conflict: WeeklyCalendarConflict, week: AiPlanWeek, scheduleBlocks: WeeklyScheduleBlock[]): number {
  const session = findSessionInWeek(week, conflict.sessionId);
  const sourceDayCapacity = computeSourceDayCapacity(week, conflict.sessionId, scheduleBlocks);
  if (!session || !sourceDayCapacity) return 0;
  return computeSessionDayFitScore(session, sourceDayCapacity);
}

/** Schwerste Konflikte zuerst (niedrigster Fit-Score), damit sie die erste Wahl unter den freien Zieltagen bekommen; sessionId als deterministischer Tie-Break. */
function sortConflictsBySeverity(
  conflicts: WeeklyCalendarConflict[],
  week: AiPlanWeek,
  scheduleBlocks: WeeklyScheduleBlock[],
): WeeklyCalendarConflict[] {
  return conflicts
    .map((conflict) => ({ conflict, fitScore: conflictFitScore(conflict, week, scheduleBlocks) }))
    .sort((a, b) => (a.fitScore !== b.fitScore ? a.fitScore - b.fitScore : a.conflict.sessionId.localeCompare(b.conflict.sessionId)))
    .map((entry) => entry.conflict);
}

/**
 * Rein lesender Greedy-Vorschlag (Schritt 2): schlägt pro Kalenderkonflikt aus
 * `scanWeekForCalendarConflicts` einen alternativen Zieltag in derselben Woche vor, ohne dass zwei
 * Konflikte denselben Zieltag doppelt zugewiesen bekommen. Kein echter Optimierer – jede Session wird
 * unabhängig gegen den unveränderten IST-Zustand der Woche gescored (kein kumulativer
 * "was-wäre-wenn"-Effekt vorheriger Zuweisungen); nur bereits VERGEBENE Zieltage werden pro Durchlauf
 * ausgeschlossen. Ein Zieltag gilt erst als vergeben, wenn eine vorherige (schwerere) Session ihn
 * tatsächlich gewonnen hat – ein Zieltag, der nur Kandidat einer unresolved gebliebenen Session war,
 * bleibt für nachfolgende Sessions frei.
 *
 * Nutzt dieselbe Ranking-Primitive (`rankCalendarReassignmentCandidates`) wie das "Bearbeiten"-Panel
 * hinter dem Einzel-Tag-📅-Button – dessen `isConflict`-Flag (Capacity-Fit UND Micro-Structure)
 * entscheidet, ob ein Kandidat als Lösung zählt. Erzeugt keinen PlanPatch, ruft weder
 * `assignSessionToBestCapacityDay` noch `buildCalendarReassignmentAction` auf – reine Vorschau.
 * Gesperrte Sessions (`lockedSessionIds`) werden nie als Zieltag angeboten.
 */
export function proposeWeekCalendarReassignments(
  conflicts: WeeklyCalendarConflict[],
  week: AiPlanWeek,
  scheduleBlocks: WeeklyScheduleBlock[],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
): WeekCalendarReassignmentProposal[] {
  const plan: AiPlanWeek[] = [week];
  const ordered = sortConflictsBySeverity(conflicts, week, scheduleBlocks);
  const takenTargetSessionIds = new Set<string>();
  const proposals: WeekCalendarReassignmentProposal[] = [];

  for (const conflict of ordered) {
    const allCandidates = buildCalendarReassignmentCandidates(week, conflict.sessionId, scheduleBlocks, lockedSessionIds);
    const availableCandidates = allCandidates.filter((c) => !takenTargetSessionIds.has(c.targetSessionId));
    const sourceDayCapacity = computeSourceDayCapacity(week, conflict.sessionId, scheduleBlocks);
    const ranked = rankCalendarReassignmentCandidates(plan, conflict.sessionId, availableCandidates, sourceDayCapacity);
    const winner = ranked.find((r) => !r.isConflict);

    if (!winner) {
      proposals.push({
        sessionId: conflict.sessionId,
        fromDayIso: conflict.dayIso,
        unresolved: true,
        cause: conflict.cause,
        reason:
          availableCandidates.length === 0
            ? "Keine freien Ausweichtage mehr in dieser Woche – alle Alternativen sind bereits an schwerwiegendere Konflikte vergeben."
            : "Kein konfliktfreier Ausweichtag unter den verbleibenden Kandidaten gefunden.",
      });
      continue;
    }

    takenTargetSessionIds.add(winner.targetSessionId);
    proposals.push({
      sessionId: conflict.sessionId,
      fromDayIso: conflict.dayIso,
      toDayIso: winner.dateIso,
      cause: conflict.cause,
      reason: `Ausweichtag ${winner.dateIso} gefunden (Fit-Score ${winner.combinedFit.toFixed(2)}).`,
    });
  }

  return proposals;
}
