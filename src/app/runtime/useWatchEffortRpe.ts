import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { getAppNowEpochMs } from "../../core/time/timeSystem";
import type { SessionLog } from "../../marathonPrediction";
import {
  applyWatchRpeToLog,
  pickEffortRpe,
  pickWatchEffortCandidates,
  readWorkoutEffortSafe,
} from "../../appleHealth/watchEffortRpe";

type Logs = Record<string, SessionLog>;

/**
 * Übernimmt die Anstrengung der Apple Watch als Session-RPE (Baustein C): für jede Einheit mit zugeordnetem Workout
 * ohne RPE wird der Effort gelesen. Greift nur, solange die Einheit noch keine RPE hat – geprüft gegen den
 * *aktuellen* Log-Stand direkt vor dem Schreiben, damit eine zwischenzeitlich von Hand gegebene RPE bleibt.
 *
 * @param getLogs  aktueller Log-Stand (Ref), nicht der Render-Snapshot
 * @param save     Speichern wie im Rest der App; wird über einen Ref immer in der neuesten Fassung aufgerufen
 */
export function useWatchEffortRpe(args: {
  enabled: boolean;
  logs: Logs;
  getLogs: () => Logs;
  save: (logs: Logs, syncSessionIds: string[]) => Promise<unknown> | void;
}): void {
  const { enabled, logs } = args;
  const saveRef = useRef(args.save);
  saveRef.current = args.save;
  const getLogsRef = useRef(args.getLogs);
  getLogsRef.current = args.getLogs;
  const lastCheckedMs = useRef(new Map<string, number>());
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) return;
    if (running.current) return;
    const candidates = pickWatchEffortCandidates({
      logs,
      nowMs: getAppNowEpochMs(),
      lastCheckedMs: lastCheckedMs.current,
    });
    if (candidates.length === 0) return;

    running.current = true;
    void (async () => {
      try {
        for (const c of candidates) {
          lastCheckedMs.current.set(c.sessionId, getAppNowEpochMs());
          const pick = pickEffortRpe(await readWorkoutEffortSafe(c.workoutStart, c.workoutEnd));
          if (!pick) continue;
          const latest = getLogsRef.current();
          const next = applyWatchRpeToLog(latest[c.sessionId], pick);
          if (!next || next === latest[c.sessionId]) continue; // inzwischen schon eine RPE → nichts überschreiben
          await saveRef.current({ ...latest, [c.sessionId]: next }, [c.sessionId]);
        }
      } catch (e) {
        console.warn("[useWatchEffortRpe] failed", e);
      } finally {
        running.current = false;
      }
    })();
  }, [enabled, logs]);
}
