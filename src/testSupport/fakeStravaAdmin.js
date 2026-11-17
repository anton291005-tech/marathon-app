/**
 * Kleiner In-Memory-Ersatz für den Supabase-Service-Client, nur so weit, wie der Strava-Import ihn
 * braucht: `strava_connections` (select/update/upsert) und `health_workouts` (upsert/delete/select).
 * `syncColumns: false` simuliert eine Datenbank ohne Migration 024 (Fehler 42703 bei den neuen Spalten).
 */

const SYNC_COLUMNS = ["last_synced_at", "last_sync_status", "disconnected_at"];

function missingColumnError() {
  return { code: "42703", message: "column does not exist" };
}

function createFakeStravaAdmin({ connection = null, workouts = [], syncColumns = true, nowIso } = {}) {
  const db = {
    connection: connection ? { ...connection } : null,
    workouts: workouts.map((w) => ({ created_at: nowIso || "2026-11-16T00:00:00.000Z", ...w })),
    calls: [],
  };

  function touchesSyncColumns(obj) {
    return Object.keys(obj || {}).some((k) => SYNC_COLUMNS.includes(k));
  }

  function connectionsBuilder() {
    return {
      select(cols) {
        const wantsSync = SYNC_COLUMNS.some((c) => String(cols).includes(c));
        return {
          eq() {
            return {
              async maybeSingle() {
                db.calls.push({ table: "strava_connections", op: "select", cols });
                if (wantsSync && !syncColumns) return { data: null, error: missingColumnError() };
                return { data: db.connection ? { ...db.connection } : null, error: null };
              },
            };
          },
        };
      },
      update(patch) {
        return {
          async eq() {
            db.calls.push({ table: "strava_connections", op: "update", patch });
            if (touchesSyncColumns(patch) && !syncColumns) return { error: missingColumnError() };
            if (db.connection) db.connection = { ...db.connection, ...patch };
            return { error: null };
          },
        };
      },
    };
  }

  function workoutsBuilder() {
    return {
      async upsert(rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        db.calls.push({ table: "health_workouts", op: "upsert", count: list.length });
        for (const row of list) {
          const i = db.workouts.findIndex((w) => w.user_id === row.user_id && w.source_id === row.source_id);
          if (i >= 0) db.workouts[i] = { ...db.workouts[i], ...row };
          else db.workouts.push({ created_at: nowIso || "2026-11-16T00:00:00.000Z", id: `row-${db.workouts.length + 1}`, ...row });
        }
        return { error: null };
      },
      delete() {
        const filters = [];
        const chain = {
          eq(col, val) {
            filters.push((w) => w[col] === val);
            return chain;
          },
          like(col, pattern) {
            const prefix = String(pattern).replace(/%$/, "");
            filters.push((w) => String(w[col]).startsWith(prefix));
            return chain;
          },
          lt(col, val) {
            filters.push((w) => String(w[col]) < String(val));
            return chain;
          },
          then(resolve) {
            db.calls.push({ table: "health_workouts", op: "delete" });
            db.workouts = db.workouts.filter((w) => !filters.every((f) => f(w)));
            resolve({ error: null });
          },
        };
        return chain;
      },
    };
  }

  const admin = {
    from(table) {
      if (table === "strava_connections") return connectionsBuilder();
      if (table === "health_workouts") return workoutsBuilder();
      throw new Error(`fakeStravaAdmin: unexpected table ${table}`);
    },
  };

  return { admin, db };
}

/** Antwort im Stil von `fetch` für die Strava-API. */
function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

module.exports = { createFakeStravaAdmin, jsonResponse };
