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

/**
 * true, wenn der Lauf aus dem Strava-Import stammt – erkennbar NUR am ID-Präfix `strava:`.
 * Ein HealthKit-Workout, das die Strava-App nach Apple Health schreibt (hk_-ID, Quelle „Strava“),
 * ist ein Apple-Health-Lauf: er wird wie jeder Apple-Health-Lauf behandelt (Vorrang, Dedup innerhalb
 * HealthKit, kein 7-Tage-Aufräumen), weil er nicht über die Strava-API kam.
 */
export function isStravaSourcedRun(run: RunLike): boolean {
  if (!run || typeof run !== "object") return false;
  return isStravaRunId(run.runId);
}

/**
 * Welche Läufe die automatische Zuordnung sieht: Strava-Läufe nur bei bestätigter Verbindung
 * (`connected === true`). Ohne Verbindung (getrennt, Löschen beim Trennen gescheitert, Status noch
 * unbekannt) bleiben übrig gebliebene `strava:`-Zeilen außen vor. Ohne Strava-Läufe dieselbe Liste.
 */
export function selectRunsForAutoAssignment<T extends RunLike>(runs: T[], stravaConnected: boolean | null): T[] {
  if (stravaConnected === true) return runs;
  const filtered = runs.filter((run) => !isStravaSourcedRun(run));
  return filtered.length === runs.length ? runs : filtered;
}
