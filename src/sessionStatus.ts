import { isSessionLogDone } from "./appSmartFeatures";

export type SessionStatus = "open" | "done" | "skipped";

/**
 * Einzige Status-Ableitung für Session-Logs (Woche- und Heute-Tab): `skipped` gewinnt vor `done`,
 * `done` umfasst auch eine zugeordnete Health-Einheit (siehe `isSessionLogDone`).
 */
export function getSessionStatus(
  log: { done?: boolean; skipped?: boolean; assignedRun?: { runId?: string } | null } | null | undefined,
): SessionStatus {
  if (log?.skipped) return "skipped";
  if (isSessionLogDone(log)) return "done";
  return "open";
}
