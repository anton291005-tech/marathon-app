"use strict";

/**
 * Strava-Import (POST /api/strava/sync): holt die Läufe eines Nutzers von Strava und schreibt sie als
 * `health_workouts`-Zeilen (`source_id = 'strava:<id>'`). Danach ordnet der Client sie mit derselben
 * Logik wie Apple-Health-Workouts den geplanten Einheiten zu.
 *
 * Testbar ohne Netz: `fetchImpl`, `admin` (Supabase-Service-Client) und `now` werden injiziert.
 *
 * Strava-Regeln (API Policy, gültig ab 01.06.2026), die hier umgesetzt sind:
 * - §6.2 Cache höchstens 7 Tage: Strava-Zeilen, die älter als 7 Tage im Bestand sind, werden bei jedem
 *   Abgleich gelöscht (`purgeExpiredStravaWorkouts`).
 * - §5.3 keine Verwendung in KI-Anwendungen: der Coach-Kontext filtert `strava:`-Quellen
 *   (`src/lib/ai/getAiContext.ts`, `api/_lib/coachHealthRunFields.js`).
 */

const { getValidStravaAccessToken, isMissingColumnError, createSupabaseAdminClient } = require("./stravaService");
const { guardRequest } = require("./apiGuard");

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const STRAVA_SOURCE_PREFIX = "strava:";
/** Nur diese Sportarten werden importiert (`sport_type`, Rückfall auf das ältere `type`). */
const STRAVA_RUN_SPORT_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);
/**
 * Erster Abgleich (oder ohne Spalte `last_synced_at`): so viele Tage zurück. 10 = Fenster der
 * automatischen Zuordnung (`applyAppleHealthTrainingSync` maxAgeDays) – ältere Läufe würden nie
 * zugeordnet und lokal ohnehin nach 7 Tagen verworfen (Datensparsamkeit).
 */
const FIRST_SYNC_DAYS = 10;
/**
 * `after` filtert nach Startzeit, nicht nach Upload-Zeit: ein Lauf, der vor dem letzten Abgleich begann,
 * aber erst danach von der Uhr zu Strava kam, fiele sonst durch.
 * ENTSCHEIDUNG (Anton absegnen): 72 h Überlappung (Uhr erst am nächsten Tag mit dem Handy gekoppelt);
 * der Upsert ist idempotent, die Überlappung kostet nur eine Seite mehr.
 */
const RESYNC_OVERLAP_HOURS = 72;
/** ENTSCHEIDUNG (Anton absegnen): Strava API Policy §6.2 – Strava-Daten höchstens 7 Tage im Cache. */
const STRAVA_CACHE_MAX_DAYS = 7;
const PER_PAGE = 100;
/** Schutz gegen Endlos-Pagination: 5 × 100 Aktivitäten reichen für das 10-Tage-Fenster weit. */
const MAX_PAGES = 5;

class StravaHttpError extends Error {
  constructor(status, message, retryAfterSeconds) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function finiteNumber(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Laufart einer Strava-Aktivität: `sport_type` (neu), sonst `type` (veraltet). */
function stravaActivitySportType(activity) {
  if (!activity || typeof activity !== "object") return "";
  const sport = typeof activity.sport_type === "string" ? activity.sport_type.trim() : "";
  if (sport) return sport;
  return typeof activity.type === "string" ? activity.type.trim() : "";
}

function isStravaRunActivity(activity) {
  return STRAVA_RUN_SPORT_TYPES.has(stravaActivitySportType(activity));
}

/**
 * Kalorien nur, wenn Strava sie direkt liefert (`calories`, nur in der Detailansicht).
 * ENTSCHEIDUNG (Anton absegnen): `kilojoules` wird nicht umgerechnet – das ist mechanische Arbeit
 * (Leistungsmesser), kein Energieumsatz; die übliche 1:1-Näherung setzt einen Wirkungsgrad voraus
 * und ist damit nicht eindeutig.
 */
function stravaActivityCalories(activity) {
  const kcal = finiteNumber(activity?.calories);
  return kcal != null && kcal > 0 ? Math.round(kcal) : null;
}

/**
 * Eine Strava-Aktivität (SummaryActivity aus `GET /athlete/activities`) → `health_workouts`-Zeile.
 * `null`, wenn kein Lauf oder ohne gültige ID/Startzeit.
 */
function mapStravaActivityToWorkoutRow(userId, activity) {
  if (!isStravaRunActivity(activity)) return null;
  const id = activity.id;
  if (id == null || String(id).trim() === "") return null;
  const startMs = Date.parse(activity.start_date);
  if (!Number.isFinite(startMs)) return null;

  const moving = finiteNumber(activity.moving_time);
  const elapsed = finiteNumber(activity.elapsed_time);
  const durationSeconds = moving != null && moving > 0 ? moving : elapsed != null && elapsed > 0 ? elapsed : null;
  const distance = finiteNumber(activity.distance);
  const avgHr = activity.has_heartrate === false ? null : finiteNumber(activity.average_heartrate);
  // Die Liste liefert keine Splits; `splits_metric` gibt es nur in der Detailansicht (Zusatzaufruf je Lauf).
  const splits = Array.isArray(activity.splits_metric) && activity.splits_metric.length > 0 ? activity.splits_metric : null;

  return {
    user_id: userId,
    source_id: `${STRAVA_SOURCE_PREFIX}${String(id).trim()}`,
    workout_type: "running",
    start_time: new Date(startMs).toISOString(),
    duration_seconds: durationSeconds != null ? Math.round(durationSeconds) : null,
    distance_meters: distance != null && distance > 0 ? distance : null,
    avg_heart_rate: avgHr != null && avgHr > 0 ? Math.round(avgHr) : null,
    calories: stravaActivityCalories(activity),
    splits,
    laps: null,
    gps_stream: null,
    interval_snapshot: null,
  };
}

/** Sekunden bis zum nächsten 15-Minuten-Fenster von Strava (:00, :15, :30, :45). */
function secondsUntilNextStravaWindow(nowMs) {
  const windowMs = 15 * 60 * 1000;
  const next = Math.floor(nowMs / windowMs) * windowMs + windowMs;
  return Math.max(60, Math.ceil((next - nowMs) / 1000));
}

function retryAfterFromResponse(response, nowMs) {
  const header = response?.headers?.get ? response.headers.get("retry-after") : null;
  const parsed = finiteNumber(header);
  return parsed != null && parsed > 0 ? Math.ceil(parsed) : secondsUntilNextStravaWindow(nowMs);
}

/** Alle Laufseiten ab `afterEpochSeconds`; wirft `StravaHttpError` bei 401/403/429/5xx. */
async function fetchStravaActivitiesSince({ accessToken, afterEpochSeconds, fetchImpl, nowMs }) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set("after", String(afterEpochSeconds));
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!response.ok) {
      const retryAfter = response.status === 429 ? retryAfterFromResponse(response, nowMs) : undefined;
      throw new StravaHttpError(response.status, `Strava activities HTTP ${response.status}`, retryAfter);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new StravaHttpError(502, "Strava activities: unexpected payload");
    }
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}

/** Verbindung lesen; ohne Migration 024 nur die Grundspalten. `null` = keine Verbindung. */
async function loadStravaConnection(admin, userId) {
  let { data, error } = await admin
    .from("strava_connections")
    .select("strava_athlete_id, scope, last_synced_at, disconnected_at")
    .eq("user_id", userId)
    .maybeSingle();
  let syncStateAvailable = true;
  if (error && isMissingColumnError(error)) {
    syncStateAvailable = false;
    ({ data, error } = await admin
      .from("strava_connections")
      .select("strava_athlete_id, scope")
      .eq("user_id", userId)
      .maybeSingle());
  }
  if (error) throw new Error(`Strava connection lookup failed: ${error.code || "unknown"}`);
  if (!data || !data.strava_athlete_id) return null;
  return { ...data, syncStateAvailable };
}

/** Sync-Status schreiben; fehlt Migration 024, ruhig nichts tun. */
async function updateSyncState(admin, userId, connection, patch) {
  if (!connection?.syncStateAvailable) return;
  const { error } = await admin.from("strava_connections").update(patch).eq("user_id", userId);
  if (error && !isMissingColumnError(error)) {
    // eslint-disable-next-line no-console
    console.warn("[stravaSync] sync state update failed", error.code || "unknown");
  }
}

/** Strava API Policy §6.2: Strava-Zeilen, die länger als 7 Tage im Bestand sind, löschen. */
async function purgeExpiredStravaWorkouts(admin, userId, nowMs) {
  const cutoffIso = new Date(nowMs - STRAVA_CACHE_MAX_DAYS * 86400000).toISOString();
  const { error } = await admin
    .from("health_workouts")
    .delete()
    .eq("user_id", userId)
    .like("source_id", `${STRAVA_SOURCE_PREFIX}%`)
    .lt("created_at", cutoffIso);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[stravaSync] cache purge failed", error.code || "unknown");
  }
}

function syncWindowStartEpochSeconds(connection, nowMs) {
  const floorMs = nowMs - FIRST_SYNC_DAYS * 86400000;
  const lastMs = connection?.last_synced_at ? Date.parse(connection.last_synced_at) : NaN;
  if (!Number.isFinite(lastMs)) return Math.floor(floorMs / 1000);
  const withOverlap = lastMs - RESYNC_OVERLAP_HOURS * 3600000;
  return Math.floor(Math.max(floorMs, Math.min(withOverlap, nowMs)) / 1000);
}

function hasActivityReadScope(scope) {
  if (typeof scope !== "string" || !scope.trim()) return true; // alte Zeilen: Scope unbekannt → versuchen
  return scope.split(/[\s,]+/).some((part) => part === "activity:read" || part === "activity:read_all");
}

/**
 * Ein Abgleich für einen Nutzer. Liefert immer ein Ergebnis-Objekt, wirft nur bei Programmierfehlern.
 *
 * @returns {Promise<
 *   | { status: "ok", imported: number, fetched: number, skipped: number, since: string }
 *   | { status: "not_connected" }
 *   | { status: "reconnect_required" }
 *   | { status: "rate_limited", retryAfter: number }
 *   | { status: "error" }
 * >}
 */
async function syncStravaActivitiesForUser({ admin, userId, fetchImpl = fetch, now = () => Date.now(), getAccessToken }) {
  const nowMs = now();
  const tokenFor = getAccessToken || ((id) => getValidStravaAccessToken(id, admin));

  let connection;
  try {
    connection = await loadStravaConnection(admin, userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[stravaSync] connection lookup failed", err?.message || err);
    return { status: "error" };
  }
  if (!connection) return { status: "not_connected" };

  await purgeExpiredStravaWorkouts(admin, userId, nowMs);

  const markDisconnected = async () => {
    await updateSyncState(admin, userId, connection, {
      disconnected_at: new Date(nowMs).toISOString(),
      last_sync_status: "reconnect_required",
    });
    return { status: "reconnect_required" };
  };

  if (connection.disconnected_at) return { status: "reconnect_required" };
  if (!hasActivityReadScope(connection.scope)) return markDisconnected();

  let accessToken;
  try {
    accessToken = await tokenFor(userId);
  } catch (err) {
    const status = Number(err?.status);
    if (status === 400 || status === 401) return markDisconnected();
    if (status === 429) {
      await updateSyncState(admin, userId, connection, { last_sync_status: "rate_limited" });
      return { status: "rate_limited", retryAfter: secondsUntilNextStravaWindow(nowMs) };
    }
    // eslint-disable-next-line no-console
    console.warn("[stravaSync] token refresh failed", Number.isFinite(status) ? status : "unknown");
    await updateSyncState(admin, userId, connection, { last_sync_status: "error" });
    return { status: "error" };
  }
  if (!accessToken) return { status: "not_connected" };

  const afterEpochSeconds = syncWindowStartEpochSeconds(connection, nowMs);
  let activities;
  try {
    activities = await fetchStravaActivitiesSince({ accessToken, afterEpochSeconds, fetchImpl, nowMs });
  } catch (err) {
    const status = Number(err?.status);
    if (status === 401) return markDisconnected();
    if (status === 429) {
      await updateSyncState(admin, userId, connection, { last_sync_status: "rate_limited" });
      return { status: "rate_limited", retryAfter: err.retryAfterSeconds || secondsUntilNextStravaWindow(nowMs) };
    }
    // eslint-disable-next-line no-console
    console.warn("[stravaSync] activities fetch failed", Number.isFinite(status) ? status : "unknown");
    await updateSyncState(admin, userId, connection, { last_sync_status: "error" });
    return { status: "error" };
  }

  const rows = [];
  const seen = new Set();
  for (const activity of activities) {
    const row = mapStravaActivityToWorkoutRow(userId, activity);
    if (!row || seen.has(row.source_id)) continue;
    seen.add(row.source_id);
    rows.push(row);
  }

  if (rows.length > 0) {
    const { error } = await admin.from("health_workouts").upsert(rows, { onConflict: "user_id,source_id" });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[stravaSync] upsert failed", error.code || "unknown");
      await updateSyncState(admin, userId, connection, { last_sync_status: "error" });
      return { status: "error" };
    }
  }

  await updateSyncState(admin, userId, connection, {
    last_synced_at: new Date(nowMs).toISOString(),
    last_sync_status: "ok",
    disconnected_at: null,
  });

  return {
    status: "ok",
    imported: rows.length,
    fetched: activities.length,
    skipped: activities.length - rows.length,
    since: new Date(afterEpochSeconds * 1000).toISOString(),
  };
}

/** HTTP-Status je Ergebnis: Fachzustände sind 200 (der Client wertet `status` aus), echte Fehler 502. */
function httpStatusForSyncResult(result) {
  return result.status === "error" ? 502 : 200;
}

/**
 * Gemeinsamer Handler für die Vercel-Funktion und die lokale Express-Route.
 * Pflicht-Token, keine KI-Einwilligung (kein Sprachmodell beteiligt), eigenes Kontingent `strava_sync`.
 * Der Body wird nicht gelesen.
 *
 * @returns {Promise<{ status: number, body: object, headers?: Record<string, string> }>}
 */
async function handleStravaSyncRequest(req, deps = {}) {
  const guard = await guardRequest(req, {
    validate: () => ({ ok: true, payload: {} }),
    bucket: "strava_sync",
    rateLimitBody: (retryAfterSeconds) => ({ status: "rate_limited", retryAfter: retryAfterSeconds }),
  });
  if (!guard.ok) return { status: guard.status, body: guard.body, headers: guard.headers };

  const admin = deps.admin || createSupabaseAdminClient();
  if (!admin) return { status: 503, body: { status: "error", error: "Strava integration is not configured" } };

  const result = await syncStravaActivitiesForUser({
    admin,
    userId: guard.userId,
    fetchImpl: deps.fetchImpl || fetch,
    now: deps.now,
    getAccessToken: deps.getAccessToken,
  });
  // Nur Zähler und Status, nie Inhalte.
  // eslint-disable-next-line no-console
  console.log("[stravaSync] result", result.status, result.imported ?? "", result.fetched ?? "");
  return { status: httpStatusForSyncResult(result), body: result };
}

module.exports = {
  handleStravaSyncRequest,
  httpStatusForSyncResult,
  STRAVA_API_BASE,
  STRAVA_SOURCE_PREFIX,
  STRAVA_RUN_SPORT_TYPES,
  FIRST_SYNC_DAYS,
  RESYNC_OVERLAP_HOURS,
  STRAVA_CACHE_MAX_DAYS,
  PER_PAGE,
  MAX_PAGES,
  stravaActivitySportType,
  isStravaRunActivity,
  mapStravaActivityToWorkoutRow,
  fetchStravaActivitiesSince,
  syncWindowStartEpochSeconds,
  secondsUntilNextStravaWindow,
  hasActivityReadScope,
  syncStravaActivitiesForUser,
};
