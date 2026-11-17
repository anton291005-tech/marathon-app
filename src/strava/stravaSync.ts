/**
 * Client des Strava-Imports (POST /api/strava/sync, Server: `api/_lib/stravaActivitySync.js`).
 *
 * - `requestStravaSync`: ein Aufruf mit Supabase-Token, Antwort → `StravaSyncResult` (wirft nie).
 * - `createStravaSyncController`: Drossel für automatische Auslöser (App-Start, Rückkehr in den
 *   Vordergrund) – höchstens alle 15 min, lokal gemerkt; nach `rate_limited` erst nach `retryAfter`.
 *   Der Knopf „Jetzt synchronisieren“ läuft mit `force` an der Drossel vorbei.
 *
 * Ohne React und ohne Uhr-Zugriff testbar (Uhr, Speicher und Netz werden injiziert).
 */

import { STRAVA_SYNC_STATE_KEY } from "../persistence/marathonLocalStorageKeys";

export { STRAVA_SYNC_STATE_KEY };

export type StravaSyncResult =
  | { status: "ok"; imported: number; fetched: number }
  | { status: "not_connected" }
  | { status: "reconnect_required" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "error" };

export type StravaSyncReason = "cold-start" | "resume" | "manual";
export type StravaSyncOutcome =
  | { ran: true; result: StravaSyncResult }
  | { ran: false; skipped: "throttled" | "in-flight" | "backoff" };

/** Automatischer Abgleich höchstens alle 15 min. */
export const STRAVA_AUTO_SYNC_THROTTLE_MS = 15 * 60 * 1000;

export type StravaSyncPersistedState = {
  lastAutoAttemptAtMs?: number;
  /** Nach `rate_limited`: vorher kein automatischer Versuch. */
  notBeforeMs?: number;
  /** Letztes Fachergebnis, damit „Strava neu verbinden“ auch nach einem Neustart sichtbar bleibt. */
  lastStatus?: StravaSyncResult["status"];
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Antwort-Body (oder HTTP-Fehler) → Ergebnis. Unbekanntes → `error`. */
export function parseStravaSyncResponse(httpStatus: number, body: unknown): StravaSyncResult {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const status = typeof b.status === "string" ? b.status : "";
  if (httpStatus === 429 || status === "rate_limited") {
    const retry = num(b.retryAfter) ?? num(b.retryAfterSeconds) ?? 15 * 60;
    return { status: "rate_limited", retryAfter: Math.max(60, Math.round(retry)) };
  }
  if (httpStatus >= 200 && httpStatus < 300) {
    if (status === "ok") {
      return { status: "ok", imported: num(b.imported) ?? 0, fetched: num(b.fetched) ?? 0 };
    }
    if (status === "not_connected" || status === "reconnect_required") return { status };
  }
  return { status: "error" };
}

/** Ein Aufruf des Import-Endpunkts. Netzfehler, fehlendes Token (401) usw. → `error`. */
export async function requestStravaSync(deps: {
  baseUrl: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
}): Promise<StravaSyncResult> {
  try {
    const headers = await deps.getAuthHeaders();
    if (!headers.Authorization) return { status: "error" };
    const doFetch = deps.fetchImpl ?? fetch;
    const res = await doFetch(`${deps.baseUrl}/api/strava/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "{}",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return parseStravaSyncResponse(res.status, body);
  } catch (e) {
    console.warn("[stravaSync] request failed", e);
    return { status: "error" };
  }
}

export type StravaSyncController = {
  /** Wirft nie. `manual` ignoriert Drossel und Wartezeit, aber nie einen laufenden Abgleich. */
  trigger: (reason: StravaSyncReason) => Promise<StravaSyncOutcome>;
};

/** Ob ein automatischer Versuch jetzt laufen darf (rein). */
export function stravaAutoSyncAllowed(
  state: StravaSyncPersistedState,
  nowMs: number,
  throttleMs: number = STRAVA_AUTO_SYNC_THROTTLE_MS,
): "ok" | "throttled" | "backoff" {
  const notBefore = num(state.notBeforeMs);
  if (notBefore != null && nowMs < notBefore) return "backoff";
  const last = num(state.lastAutoAttemptAtMs);
  // Uhr zurückgestellt: alten Zeitstempel ignorieren.
  if (last != null && nowMs >= last && nowMs - last < throttleMs) return "throttled";
  return "ok";
}

export function createStravaSyncController(deps: {
  runSync: () => Promise<StravaSyncResult>;
  onResult?: (result: StravaSyncResult, reason: StravaSyncReason) => void | Promise<void>;
  nowEpochMs: () => number;
  readState: () => StravaSyncPersistedState;
  writeState: (state: StravaSyncPersistedState) => void;
  throttleMs?: number;
}): StravaSyncController {
  let inFlight = false;
  return {
    async trigger(reason) {
      if (inFlight) return { ran: false, skipped: "in-flight" };
      const now = deps.nowEpochMs();
      const state = deps.readState() ?? {};
      if (reason !== "manual") {
        const allowed = stravaAutoSyncAllowed(state, now, deps.throttleMs);
        if (allowed !== "ok") return { ran: false, skipped: allowed };
      }
      inFlight = true;
      const nextState: StravaSyncPersistedState = { ...state };
      if (reason !== "manual") nextState.lastAutoAttemptAtMs = now;
      deps.writeState(nextState);
      try {
        let result: StravaSyncResult;
        try {
          result = await deps.runSync();
        } catch (e) {
          console.warn(`[stravaSync] ${reason} sync failed`, e);
          result = { status: "error" };
        }
        const after: StravaSyncPersistedState = { ...nextState, lastStatus: result.status };
        if (result.status === "rate_limited") after.notBeforeMs = now + result.retryAfter * 1000;
        else delete after.notBeforeMs;
        deps.writeState(after);
        try {
          await deps.onResult?.(result, reason);
        } catch (e) {
          console.warn("[stravaSync] onResult failed", e);
        }
        return { ran: true, result };
      } finally {
        inFlight = false;
      }
    },
  };
}
