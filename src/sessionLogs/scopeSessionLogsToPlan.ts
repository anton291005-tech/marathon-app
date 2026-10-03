/**
 * Bindet Session-Logs an den aktiven Plan.
 *
 * Logs hängen nur an der Session-ID, und KI-Pläne vergeben IDs nach Woche/Wochentag (`w5-mo`) —
 * in jedem Plan dieselben. Ohne Bindung „passen" die Logs einer früheren Vorbereitung auf den
 * neuen Plan (Fortschritt, km, Serie, sogar ein erledigtes Zielrennen).
 *
 * Bindung ohne Plan-Spalte in `session_logs`: Ein Log, das nachweislich VOR dem Plan entstanden ist,
 * gehört nicht zu diesem Plan. Zeitpunkt = späteste bekannte Angabe aus `at` (Zeitpunkt des
 * Loggens) und `assignedRun.startDate` (zugeordnetes Workout). Grenze:
 * - immer der erste Workout-Tag des Plans (Kalendertag);
 * - zusätzlich ein Zeitpunkt `notBefore`, wenn der Plan nachweislich als Nachfolger einer
 *   archivierten Vorbereitung entstand (siehe `logsNotBeforeForSuccessorPlan`). Fängt Logs vom
 *   Starttag selbst (Zielrennen am Renntag erledigt, neuer Plan startet am selben Tag). Bewusst NICHT
 *   `created_at` des Plans: das ist bei registrierten Gästen der Migrationszeitpunkt, und deren
 *   eigene Logs vom Starttag lägen davor.
 * Logs ganz ohne Zeitangabe (Altbestand) bleiben erhalten — ohne Beleg wird nichts verworfen.
 */

import { getAppCalendarYmd } from "../core/time/timeSystem";
import type { SessionLog } from "../marathonPrediction";
import type { TrainingPlanV2 } from "../planV2/types";

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toCalendarYmd(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (YMD_PATTERN.test(value)) return value;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? getAppCalendarYmd(d) : null;
}

/** Erster Kalendertag des Plans (frühestes Workout, YYYY-MM-DD); null ohne datierte Workouts. */
export function planStartYmd(plan: TrainingPlanV2 | null | undefined): string | null {
  let start: string | null = null;
  for (const workout of plan?.workouts ?? []) {
    const ymd = toCalendarYmd(workout?.dateIso);
    if (ymd && (start == null || ymd < start)) start = ymd;
  }
  return start;
}

/** Späteste bekannte Zeitangabe des Logs als Kalendertag; null ohne Zeitangabe. */
export function sessionLogLatestYmd(log: SessionLog | null | undefined): string | null {
  if (!log) return null;
  let latest: string | null = null;
  for (const candidate of [log.at, log.assignedRun?.startDate]) {
    const ymd = toCalendarYmd(candidate);
    if (ymd && (latest == null || ymd > latest)) latest = ymd;
  }
  return latest;
}

/** Späteste bekannte Zeitangabe des Logs in Epoch-ms; null ohne Zeitangabe. */
function sessionLogLatestMs(log: SessionLog | null | undefined): number | null {
  if (!log) return null;
  let latest: number | null = null;
  for (const candidate of [log.at, log.assignedRun?.startDate]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms) && (latest == null || ms > latest)) latest = ms;
  }
  return latest;
}

export function isSessionLogBeforePlanStart(log: SessionLog | null | undefined, startYmd: string | null): boolean {
  if (!startYmd) return false;
  const ymd = sessionLogLatestYmd(log);
  return ymd != null && ymd < startYmd;
}

function toEpochMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * `archived_at` (Client-Uhr) und `created_at` (Server-Uhr) stammen aus verschiedenen Uhren; der
 * Nachfolger wird Sekunden nach der Archivierung angelegt. Toleranz für Uhrenabweichung.
 */
const SUCCESSOR_CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/**
 * Grenze für Logs des aktiven Plans, wenn er der Nachfolger einer archivierten Vorbereitung ist
 * („Neue Vorbereitung starten": archivieren, dann sofort anlegen): die letzte Archivierung, die
 * nicht nach seiner Erstellung lag. Alles davor gehört zur archivierten Vorbereitung. Ohne Archiv
 * (z. B. registrierter Gast) oder für einen älteren, parallel angelegten Plan: null.
 */
export function logsNotBeforeForSuccessorPlan(
  activePlanCreatedAt: string | null | undefined,
  archivedPlans: ReadonlyArray<{ archived_at: string | null }>,
): string | null {
  const createdMs = toEpochMs(activePlanCreatedAt);
  if (createdMs == null) return null;
  let best: { iso: string; ms: number } | null = null;
  for (const plan of archivedPlans ?? []) {
    const ms = toEpochMs(plan?.archived_at);
    if (ms == null || ms > createdMs + SUCCESSOR_CLOCK_TOLERANCE_MS) continue;
    if (best == null || ms > best.ms) best = { iso: plan.archived_at as string, ms };
  }
  return best?.iso ?? null;
}

/**
 * Logs des aktiven Plans: ohne Logs von vor dem Planstart. Gibt das Eingabeobjekt unverändert
 * zurück, wenn nichts herausfällt (stabile Referenz für Memos).
 */
export function scopeSessionLogsToPlan(
  logs: Record<string, SessionLog>,
  plan: TrainingPlanV2 | null | undefined,
  /** Zusätzliche Zeitgrenze (ISO): Logs davor gehören nicht zum Plan. */
  notBefore?: string | null,
): Record<string, SessionLog> {
  const startYmd = planStartYmd(plan);
  if (!startYmd) return logs;
  const cutoffMs = toEpochMs(notBefore);
  const isForeign = (log: SessionLog) => {
    if (isSessionLogBeforePlanStart(log, startYmd)) return true;
    if (cutoffMs == null) return false;
    const ms = sessionLogLatestMs(log);
    return ms != null && ms < cutoffMs;
  };
  let out: Record<string, SessionLog> | null = null;
  for (const [sessionId, log] of Object.entries(logs ?? {})) {
    if (isForeign(log)) {
      if (!out) out = { ...logs };
      delete out[sessionId];
    }
  }
  return out ?? logs;
}

/**
 * Schreibpfad: `next` wurde aus der Plan-Sicht gebaut. Logs, die nur wegen der Plan-Bindung
 * ausgeblendet waren, bleiben im Bestand (z. B. für einen Planwechsel) — außer `next` belegt
 * dieselbe Session-ID neu.
 */
export function mergeWithLogsOutsidePlanScope(
  stored: Record<string, SessionLog>,
  scoped: Record<string, SessionLog>,
  next: Record<string, SessionLog>,
): Record<string, SessionLog> {
  if (stored === scoped) return next;
  const outside: Record<string, SessionLog> = {};
  for (const [sessionId, log] of Object.entries(stored ?? {})) {
    if (!(sessionId in scoped)) outside[sessionId] = log;
  }
  return { ...outside, ...next };
}
