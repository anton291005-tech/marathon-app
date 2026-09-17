import type { AiPlanWeek, AiPlanSession } from "../../lib/ai/types";
import type { WeeklyScheduleBlock } from "../../lib/supabase/services/weeklyScheduleBlocksService";
import { computeDayCapacityScore, computeSessionDayFitScore } from "../../scheduling/capacityScore";
import { MIN_FIT_SCORE_THRESHOLD } from "./assignSessionToBestCapacityDay";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppCalendarYmd } from "../../core/time/timeSystem";

export type WeeklyCalendarConflict = {
  sessionId: string;
  dayIso: string;
  conflictReason: string;
};

function sessionDateIso(session: AiPlanSession): string | null {
  const parsed: Date | null = parseSessionDateLabel(session.date);
  if (!parsed) return null;
  return getAppCalendarYmd(parsed);
}

function describeConflict(session: AiPlanSession, fitScore: number, dayCapacity: ReturnType<typeof computeDayCapacityScore>): string {
  if (dayCapacity.isFullyBooked) {
    return `Tag ist durch Kalender-Termine komplett belegt (0 von ${dayCapacity.windowMinutes} Min. frei).`;
  }
  return `Kalender-Termine belegen ${dayCapacity.busyMinutes} von ${dayCapacity.windowMinutes} Min. – nur ${dayCapacity.freeMinutes} Min. frei für "${session.title}" (Fit-Score ${fitScore.toFixed(2)}).`;
}

/**
 * Rein lesender Wochen-Scan: wendet dieselbe Capacity-Scoring-Logik, die der 📅-Button pro Klick
 * für eine einzelne Session nutzt (`computeDayCapacityScore` + `computeSessionDayFitScore` aus
 * capacityScore.ts, gleiche Schwelle `MIN_FIT_SCORE_THRESHOLD`), auf alle Sessions der Woche an —
 * bewertet aber nur den jeweils AKTUELLEN Tag jeder Session (IST-Zustand), nicht mögliche
 * Ziel-Kandidaten für eine Verschiebung. Micro-Structure (Erholungsabstände) ist hier bewusst
 * ausgeklammert, da diese Prüfung erst bei einer tatsächlichen Verschiebung relevant wird (siehe
 * `scoreCandidate` in assignSessionToBestCapacityDay.ts), nicht für den unveränderten Status quo.
 *
 * Erzeugt keinen PlanPatch und verändert nichts – dient nur der Erkennung, welche Tage der Woche
 * mit den hinterlegten Kalender-Blocks kollidieren. Der bestehende Einzel-Tag-📅-Handler
 * (`handleProposeCalendarReassignment` in AppMain.tsx) bleibt davon unberührt.
 */
export function scanWeekForCalendarConflicts(
  week: AiPlanWeek,
  scheduleBlocks: WeeklyScheduleBlock[],
): WeeklyCalendarConflict[] {
  const conflicts: WeeklyCalendarConflict[] = [];
  for (const session of week.s ?? []) {
    const dayIso = sessionDateIso(session);
    if (!dayIso) continue;

    const dayCapacity = computeDayCapacityScore(dayIso, scheduleBlocks);
    const fitScore = computeSessionDayFitScore(session, dayCapacity);
    if (fitScore >= MIN_FIT_SCORE_THRESHOLD) continue;

    conflicts.push({
      sessionId: session.id,
      dayIso,
      conflictReason: describeConflict(session, fitScore, dayCapacity),
    });
  }
  return conflicts;
}
