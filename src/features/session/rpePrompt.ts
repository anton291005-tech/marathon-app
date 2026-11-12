/**
 * Nachfrage „Wie anstrengend war …?“ (Readiness Plan Schritt 2, Spec §6.2): Für Einheiten, die ohne Anstrengung
 * abgehakt wurden (Schnell-„Erledigt“ auf Home, Uhr-Sync, „Später“ im Eintragen-Sheet), fragt eine Karte auf Home
 * **einmal** nach. „Später“ auf der Karte beendet die Nachfrage für diese Einheit endgültig.
 */

import { sessionYmd } from "../../core/time/sessionDate";
import { RPE_PROMPT_DISMISSED_KEY } from "../../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../../persistence/safeLocalStorage";

type PromptSession = { id: string; type?: string | null; title?: string | null; date?: string | null; dateIso?: string | null };
type PromptLog = { done?: boolean; skipped?: boolean; rpe?: number; assignedRun?: unknown } | null | undefined;

/** Wie viele Kalendertage zurück nachgefragt wird (heute und gestern). */
export const RPE_PROMPT_DAYS = 2;
/** Obergrenze der gemerkten „Später“-IDs, damit der Speicher nicht wächst. */
const MAX_DISMISSED = 200;

function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const t = new Date(Date.UTC(y, m - 1, d - days));
  return t.toISOString().slice(0, 10);
}

/** Jüngste erledigte Einheit der letzten Tage ohne Anstrengung, die noch nicht abgelehnt wurde. */
export function pickRpePromptSession<S extends PromptSession>(args: {
  sessions: readonly S[];
  logs: Readonly<Record<string, PromptLog>>;
  todayYmd: string;
  dismissed: ReadonlySet<string>;
}): S | null {
  const earliest = ymdMinusDays(args.todayYmd, RPE_PROMPT_DAYS - 1);
  let best: { session: S; ymd: string } | null = null;
  for (const session of args.sessions) {
    if (!session || session.type === "rest" || args.dismissed.has(session.id)) continue;
    const log = args.logs[session.id];
    // Erledigt = abgehakt oder ein Apple-Health-Lauf von Hand zugeordnet (setzt `done` nicht, zählt aber als erledigt).
    if (!log || (log.done !== true && !log.assignedRun) || log.skipped === true || typeof log.rpe === "number") continue;
    const ymd = sessionYmd(session);
    if (!ymd || ymd < earliest || ymd > args.todayYmd) continue;
    if (!best || ymd > best.ymd) best = { session, ymd };
  }
  return best?.session ?? null;
}

export function readRpePromptDismissed(): Set<string> {
  const list = safeReadLocalStorageJson<string[]>(RPE_PROMPT_DISMISSED_KEY, []);
  return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
}

export function writeRpePromptDismissed(ids: ReadonlySet<string>): void {
  const list: string[] = [];
  ids.forEach((id) => list.push(id));
  safeWriteLocalStorageJson(RPE_PROMPT_DISMISSED_KEY, list.slice(-MAX_DISMISSED));
}
