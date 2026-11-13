/**
 * Automatische Session-RPE aus der Apple Watch (Readiness-Plan Baustein C, docs/readiness-data-sources.md §3).
 *
 * Abbildung: Apples Anstrengungswert (`workoutEffortScore` selbst bewertet / `estimatedWorkoutEffortScore` von der Uhr
 * geschätzt) hat die Skala 1–10 und wird 1:1 als RPE (0–10) übernommen, auf ganze Zahlen gerundet. Die 0 („Ruhe“)
 * kommt von der Uhr nie vor. Selbst bewertet geht vor geschätzt. Eine vorhandene RPE – egal woher – wird NIE überschrieben.
 */
import type { SessionLog } from "../marathonPrediction";
import { isRpeSource, type RpeSource } from "../sessionLogs/rpeSource";
import { MyRaceHealthSignals, type WorkoutEffortResult } from "./healthSignalsPlugin";

export { isRpeSource, RPE_SOURCES, type RpeSource } from "../sessionLogs/rpeSource";

/** Effort Score (1–10) → RPE (0–10). Ungültige Werte (NaN, <1, >10) → `null`. */
export function effortScoreToRpe(score: unknown): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
}

export type WatchRpePick = { rpe: number; source: "watch_user" | "watch_estimated" };

/** Selbst bewertet vor geschätzt; ist der selbst bewertete Wert unbrauchbar, zählt der geschätzte. */
export function pickEffortRpe(effort: WorkoutEffortResult | null | undefined): WatchRpePick | null {
  if (!effort) return null;
  const user = effortScoreToRpe(effort.userScore);
  if (user != null) return { rpe: user, source: "watch_user" };
  const estimated = effortScoreToRpe(effort.estimatedScore);
  if (estimated != null) return { rpe: estimated, source: "watch_estimated" };
  return null;
}

function hasRpe(log: SessionLog | undefined): boolean {
  return typeof log?.rpe === "number" && Number.isFinite(log.rpe);
}

/** Setzt `rpe` + `rpeSource` nur, wenn die Einheit noch keine RPE hat; sonst dieselbe Referenz zurück. */
export function applyWatchRpeToLog(log: SessionLog | undefined, pick: WatchRpePick | null): SessionLog | undefined {
  if (!pick || hasRpe(log)) return log;
  return { ...(log ?? {}), rpe: pick.rpe, rpeSource: pick.source };
}

/** `rpeSource` für eine von Hand gesetzte RPE: bleibt, wenn der Wert unverändert ist, sonst „manual“. */
export function rpeSourceAfterManualInput(prev: SessionLog | undefined, nextRpe: number | null | undefined): RpeSource | undefined {
  if (typeof nextRpe !== "number") return undefined;
  if (hasRpe(prev) && prev?.rpe === nextRpe && isRpeSource(prev?.rpeSource)) return prev.rpeSource;
  return "manual";
}

export type WatchEffortCandidate = {
  sessionId: string;
  workoutStart: string;
  workoutEnd: string;
};

/** Zuordnung ist höchstens so alt, dann wird nicht mehr nachgefragt. */
export const WATCH_EFFORT_MAX_AGE_DAYS = 7;
/** Wartezeit bis zum nächsten Versuch für dieselbe Einheit (Apple liefert den geschätzten Wert teils verzögert). */
export const WATCH_EFFORT_RETRY_MS = 15 * 60 * 1000;

/** Einheiten mit zugeordnetem Workout, ohne RPE, jüngst genug und nicht gerade erst geprüft. */
export function pickWatchEffortCandidates(args: {
  logs: Readonly<Record<string, SessionLog | undefined>>;
  nowMs: number;
  lastCheckedMs: ReadonlyMap<string, number>;
}): WatchEffortCandidate[] {
  const out: WatchEffortCandidate[] = [];
  const maxAgeMs = WATCH_EFFORT_MAX_AGE_DAYS * 86400000;
  for (const sessionId of Object.keys(args.logs)) {
    const log = args.logs[sessionId];
    const run = log?.assignedRun;
    if (!log || !run || log.skipped === true || hasRpe(log)) continue;
    const startMs = Date.parse(run.startDate);
    if (!Number.isFinite(startMs) || !(run.duration > 0)) continue;
    if (args.nowMs - startMs > maxAgeMs || startMs > args.nowMs) continue;
    const last = args.lastCheckedMs.get(sessionId);
    if (last != null && args.nowMs - last < WATCH_EFFORT_RETRY_MS) continue;
    out.push({
      sessionId,
      workoutStart: new Date(startMs).toISOString(),
      workoutEnd: new Date(startMs + run.duration * 1000).toISOString(),
    });
  }
  return out;
}

/** Liest den Effort; jeder Fehler (Plugin fehlt, keine Freigabe, Web) → `null`, nie ein Wurf. */
export async function readWorkoutEffortSafe(workoutStart: string, workoutEnd: string): Promise<WorkoutEffortResult | null> {
  try {
    return await MyRaceHealthSignals.readWorkoutEffort({ workoutStart, workoutEnd });
  } catch (e) {
    console.warn("[watchEffortRpe] readWorkoutEffort failed", e);
    return null;
  }
}
