import type { AiPlanWeek, AiPlanSession } from "../../lib/ai/types";
import type { WeeklyScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import {
  computeDayCapacityScore,
  computeSessionDayFitScore,
  isPhysicalLoadConflict,
  shiftDayFitScore,
  type ShiftCapacityContext,
} from "../../scheduling/capacityScore";
import { describeCalendarConflictCause, isSessionInCalendarConflict } from "./assignSessionToBestCapacityDay";
import { NO_LOCKED_SESSION_IDS } from "./lockedSessions";
import { sessionDayIso } from "./sessionDayIso";

export type WeeklyCalendarConflict = {
  sessionId: string;
  dayIso: string;
  conflictReason: string;
  /** Klartext-Grund für den Tausch-Vorschlag, z.B. "wegen Fußballturnier" (`describeCalendarConflictCause`). */
  cause: string;
};

function describeConflict(session: AiPlanSession, fitScore: number, dayCapacity: ReturnType<typeof computeDayCapacityScore>): string {
  if (dayCapacity.isFullyBooked) {
    return `Tag ist durch Kalender-Termine komplett belegt (0 von ${dayCapacity.windowMinutes} Min. frei).`;
  }
  const shiftFit = shiftDayFitScore(session, dayCapacity);
  if (dayCapacity.shift && shiftFit != null && shiftFit <= fitScore && !isPhysicalLoadConflict(session, dayCapacity)) {
    return `Dienstplan: ${dayCapacity.shift.reasonText} – "${session.title}" passt an diesem Tag nicht (Fit-Score ${fitScore.toFixed(2)}).`;
  }
  if (isPhysicalLoadConflict(session, dayCapacity)) {
    return `Körperlich belastender Termin am selben Tag (${dayCapacity.physicalLoadBlockTitles.map((t) => `"${t}"`).join(", ")}) – "${session.title}" ist eine harte Einheit (Fit-Score ${fitScore.toFixed(2)}).`;
  }
  return `Kalender-Termine belegen ${dayCapacity.busyMinutes} von ${dayCapacity.windowMinutes} Min. – nur ${dayCapacity.freeMinutes} Min. frei für "${session.title}" (Fit-Score ${fitScore.toFixed(2)}).`;
}

/**
 * Rein lesender Wochen-Scan: wendet dieselbe Capacity-Scoring-Logik, die der Kalender-Button pro Klick
 * für eine einzelne Session nutzt (`computeDayCapacityScore` + `computeSessionDayFitScore` aus
 * capacityScore.ts, gleiche Schwelle `MIN_FIT_SCORE_THRESHOLD`), auf alle Sessions der Woche an —
 * bewertet aber nur den jeweils AKTUELLEN Tag jeder Session (IST-Zustand), nicht mögliche
 * Ziel-Kandidaten für eine Verschiebung. Micro-Structure (Erholungsabstände) ist hier bewusst
 * ausgeklammert, da diese Prüfung erst bei einer tatsächlichen Verschiebung relevant wird (siehe
 * `scoreCandidate` in assignSessionToBestCapacityDay.ts), nicht für den unveränderten Status quo.
 *
 * Erzeugt keinen PlanPatch und verändert nichts – dient nur der Erkennung, welche Tage der Woche
 * mit den hinterlegten Kalender-Blocks kollidieren. Der bestehende Einzel-Tag-Kalender-Handler
 * (`handleProposeCalendarReassignment` in AppMain.tsx) bleibt davon unberührt.
 *
 * Gesperrte Sessions (erledigt/übersprungen/vergangen, `buildLockedSessionIds`) sind nie Quelle eines
 * Konflikts.
 */
export function scanWeekForCalendarConflicts(
  week: AiPlanWeek,
  scheduleBlocks: WeeklyScheduleBlock[],
  lockedSessionIds: ReadonlySet<string> = NO_LOCKED_SESSION_IDS,
  shiftContext?: ShiftCapacityContext | null,
): WeeklyCalendarConflict[] {
  const conflicts: WeeklyCalendarConflict[] = [];
  for (const session of week.s ?? []) {
    if (lockedSessionIds.has(session.id)) continue;
    const dayIso = sessionDayIso(session);
    if (!dayIso) continue;

    const dayCapacity = computeDayCapacityScore(dayIso, scheduleBlocks, shiftContext);
    if (!isSessionInCalendarConflict(session, dayCapacity)) continue;
    const fitScore = computeSessionDayFitScore(session, dayCapacity);

    conflicts.push({
      sessionId: session.id,
      dayIso,
      conflictReason: describeConflict(session, fitScore, dayCapacity),
      cause: describeCalendarConflictCause(session, dayCapacity),
    });
  }
  return conflicts;
}
