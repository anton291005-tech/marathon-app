/**
 * Home „Pre-Start“: nur wenn noch gar keine Trainings-Aktivität geloggt ist.
 * Sobald mindestens eine Einheit erledigt oder mit echten Daten versehen ist → normales Dashboard.
 */

export type SessionLike = { id: string };
export type LogLike = {
  done?: boolean;
  skipped?: boolean;
  actualKm?: string;
  notes?: string;
  feeling?: number;
};

export function hasLoggedTrainingEngagement(
  logs: Record<string, LogLike | undefined>,
  activeSessions: SessionLike[]
): boolean {
  return activeSessions.some((session) => {
    const log = logs[session.id];
    if (!log) return false;
    if (log.done || log.skipped) return true;
    const raw = String(log.actualKm || "")
      .trim()
      .replace(",", ".");
    if (raw && !Number.isNaN(Number.parseFloat(raw)) && Number.parseFloat(raw) > 0) return true;
    if (log.notes && String(log.notes).trim()) return true;
    if (log.feeling && log.feeling > 0) return true;
    return false;
  });
}

/** true = große „Training startet noch nicht“-Kachel zeigen */
export function isHomePreStart(
  logs: Record<string, LogLike | undefined>,
  activeSessions: SessionLike[]
): boolean {
  return !hasLoggedTrainingEngagement(logs, activeSessions);
}
