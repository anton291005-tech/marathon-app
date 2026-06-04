import { parseSessionDateLabel } from "../../appSmartFeatures";
import type { PlanSession, SessionLog } from "../../marathonPrediction";

const DEFAULT_PLAN_YEAR = 2026;

/**
 * Für Plan-Fortschritt (Ring / Gesamtvorbereitung): true nur bei echter Erledigung
 * oder bestätigtem Apple-Health-Link — nicht automatisch durch Datumsablauf,
 * keine «skipped», kein Teil-km ohne done / assignedRun.
 */
export function isSessionCompletedForPlanProgress(log: SessionLog | undefined): boolean {
  if (!log || log.skipped === true) return false;
  if (log.done === true) return true;
  const rid = log.assignedRun?.runId;
  return typeof rid === "string" && rid.trim().length > 0;
}

/** Alle trainierbaren Sessions (Ruhetage ausgeschlossen); gleiche Kardinalität wie ACTIVE_SESSIONS. */
export function flattenTrainableSessionsFromPlan(plan: Array<{ s: PlanSession[] }>): PlanSession[] {
  return plan.flatMap((w) => w.s).filter((s) => s.type !== "rest");
}

/** YYYY-MM-DD für Vergleiche (Europe/Berlin vs. Datumslabel erfolgt bereits über gemeinsamen Plan-Jahres-Anker). */
export function trainableSessionToYmd(session: PlanSession, year = DEFAULT_PLAN_YEAR): string | null {
  const d = parseSessionDateLabel(session.date, year);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Anzahl Trainings-Sessions mit Plan-Datum ≤ `todayYmd` (gleiche Logik wie bisher Confidence-Aufbau). */
export function countPastTrainableSessions(sessions: PlanSession[], todayYmd: string, year = DEFAULT_PLAN_YEAR): number {
  let n = 0;
  for (const s of sessions) {
    const ymd = trainableSessionToYmd(s, year);
    if (ymd && ymd <= todayYmd) n += 1;
  }
  return n;
}

export function computeTrainableWholePlanCounts(
  sessions: PlanSession[],
  logs: Record<string, SessionLog | undefined>,
): { completed: number; total: number } {
  const total = sessions.length;
  if (total <= 0) return { completed: 0, total: 0 };
  const completed = sessions.filter((s) => isSessionCompletedForPlanProgress(logs[s.id])).length;
  return { completed, total };
}

/**
 * Home-Ring / Gesamtvorbereitung (0–100, gerundet):
 *
 * Zähler = Sessions mit `isSessionCompletedForPlanProgress(log) === true`.
 * Nenner = alle trainierbaren Plan-Sessions (keine Ruhetage), inkl. übersprungenen und zukünftigen —
 * Übersprungene bleiben im Nenner (Zähler 0), sonst würde der Nenner schrumpfen und der % könnte steigen.
 *
 * Verifikation:
 * - 60 total, 35 completed, 5 skipped, 20 future → 35/60 = 58%
 * - 60 total, 58 completed, 2 skipped → 58/60 = 97%
 * - 60 total, 0 completed, 10 dates passed (rest ohne Log) → Zähler 0, Nenner 60 → 0%
 */
export function computeTrainableWholePlanProgressPct(
  sessions: PlanSession[],
  logs: Record<string, SessionLog | undefined>,
): number {
  const { completed, total } = computeTrainableWholePlanCounts(sessions, logs);
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}
