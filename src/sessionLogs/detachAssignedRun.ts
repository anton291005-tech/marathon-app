/**
 * Zugeordneten Lauf von einem Session-Log lösen (Knopf „Zuordnung lösen“, Umhängen auf eine andere Einheit).
 *
 * Mit `assignedRun` fällt auch `runEvaluation` weg: die Auswertung (Status, Text, Abweichung) ist aus genau diesem
 * Lauf berechnet und gehört nach dem Lösen zu keinem Lauf mehr. Blieb sie stehen, ging bei einem Strava-Lauf seine
 * abgeleitete Auswertung an den Coach — die Filter (`stripStravaDerivedLogFields`, Client und Server) erkennen
 * Strava nur an `assignedRun.runId`, und der war dann weg. Strava-Daten gehen an kein Sprachmodell.
 *
 * War es ein Strava-Lauf, fallen auch `actualKm` und `durationMin` weg (sie stammen aus dem Lauf). Bei Apple Health
 * bleiben sie: der Athlet kann sie selbst eingetragen haben. Erledigt, Gefühl, Anstrengung und Notiz bleiben immer.
 */
import { isStravaRunId } from "../strava/stravaRunSource";

type LogLike = Record<string, unknown> & { assignedRun?: { runId?: unknown } | null };

export function detachAssignedRun<T extends LogLike>(log: T): T {
  const copy: Record<string, unknown> = { ...log };
  const runId = log.assignedRun?.runId;
  delete copy.assignedRun;
  delete copy.runEvaluation;
  if (isStravaRunId(typeof runId === "string" ? runId : null)) {
    delete copy.actualKm;
    delete copy.durationMin;
  }
  return copy as T;
}

/**
 * Lauf `assignedRun` einer Einheit zuordnen. Hing dort vorher ein ANDERER Lauf oder ein anderer Vorschlag, fallen
 * dessen Auswertung und (bei Strava) dessen km/Dauer weg — sonst stünde die Auswertung eines Strava-Laufs unter
 * der ID eines Apple-Health-Laufs und ginge ungefiltert an den Coach. Wird genau der vorgeschlagene bzw. schon
 * zugeordnete Lauf übernommen, bleibt seine Auswertung.
 */
export function attachAssignedRun<T extends LogLike, R extends { runId?: unknown }>(
  log: T,
  assignedRun: R,
): Omit<T, "assignedRun"> & { assignedRun: R; suggestedHealthRunId: undefined } {
  const newRunId = assignedRun.runId;
  const previousRunId = log.assignedRun?.runId;
  const suggestedRunId = (log as { suggestedHealthRunId?: unknown }).suggestedHealthRunId;
  const replacesOtherRun = previousRunId != null && previousRunId !== newRunId;
  const replacesOtherSuggestion = previousRunId == null && suggestedRunId != null && suggestedRunId !== newRunId;
  let base: Record<string, unknown> = { ...log };
  if (replacesOtherRun) base = detachAssignedRun(log);
  else if (replacesOtherSuggestion) {
    delete base.runEvaluation;
  }
  return { ...base, suggestedHealthRunId: undefined, assignedRun } as Omit<T, "assignedRun"> & { assignedRun: R; suggestedHealthRunId: undefined };
}
