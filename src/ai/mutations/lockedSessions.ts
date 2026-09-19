import type { AiPlanWeek } from "../../lib/ai/types";
import { getSessionStatus } from "../../sessionStatus";
import { parseSessionDateLabel } from "../../appSmartFeatures";
import { getAppCalendarYmd, getAppTodayYmd } from "../../core/time/timeSystem";

type SessionLogLike = Parameters<typeof getSessionStatus>[0];

/** Default für alle Sperr-Parameter: nichts gesperrt (Verhalten wie vor der Sperre). */
export const NO_LOCKED_SESSION_IDS: ReadonlySet<string> = new Set<string>();

/**
 * Sessions, die weder Quelle noch Ziel eines Kalender-Tauschs sein dürfen: Renn-Sessions
 * (`type === "race"`, wie im Plan-Modell überall erkannt — der Renntermin ist nicht verschiebbar),
 * erledigt, übersprungen (`getSessionStatus`, dieselbe Status-Ableitung wie Woche-/Heute-Tab) oder mit
 * Datum vor heute. Sessions ohne parsebares Datum werden nur über Typ und Status gesperrt.
 */
export function buildLockedSessionIds(
  weeks: AiPlanWeek[],
  logs: Record<string, SessionLogLike> | null | undefined,
  todayYmd: string = getAppTodayYmd(),
): Set<string> {
  const locked = new Set<string>();
  for (const week of weeks) {
    for (const session of week.s ?? []) {
      if (session.type === "race" || getSessionStatus(logs?.[session.id]) !== "open") {
        locked.add(session.id);
        continue;
      }
      const parsed: Date | null = parseSessionDateLabel(session.date);
      if (parsed && getAppCalendarYmd(parsed) < todayYmd) locked.add(session.id);
    }
  }
  return locked;
}
