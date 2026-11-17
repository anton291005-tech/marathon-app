/**
 * Erkennung von Läufen, die aus dem Strava-Import stammen (`health_workouts.source_id = 'strava:<id>'`,
 * Server: `api/_lib/stravaActivitySync.js`). Gilt für `StoredHealthRun` und für Session-Log-Zuordnungen.
 */

/** Präfix der `source_id`/`runId` aller Strava-Zeilen. Muss zu `STRAVA_SOURCE_PREFIX` im Server passen. */
export const STRAVA_SOURCE_PREFIX = "strava:";
/** Anzeigename der Quelle (Spalte `sourceName` gibt es in `health_workouts` nicht). */
export const STRAVA_SOURCE_NAME = "Strava";

type RunLike = { runId?: unknown; sourceName?: unknown } | null | undefined;

export function isStravaRunId(runId: unknown): boolean {
  return typeof runId === "string" && runId.trim().toLowerCase().startsWith(STRAVA_SOURCE_PREFIX);
}

/** true, wenn der Lauf aus Strava stammt (ID-Präfix oder Quellname). */
export function isStravaSourcedRun(run: RunLike): boolean {
  if (!run || typeof run !== "object") return false;
  if (isStravaRunId(run.runId)) return true;
  return typeof run.sourceName === "string" && run.sourceName.trim().toLowerCase() === "strava";
}
