/**
 * Liefert den Snapshot einer abgeschlossenen Vorbereitung — legt ihn beim ersten Aufruf EINMAL an.
 * Aufgerufen beim ersten Tap auf „Rückblick ansehen" bzw. „Neue Vorbereitung starten" (vor dem
 * Wizard, der Preferences ersetzt und Logs kürzt).
 *
 * Quelle der Wahrheit ist `prep_recaps` (Supabase). Der lokale Cache hält eine Kopie für offline;
 * existiert ein Snapshot nur im Cache (Remote war beim Anlegen nicht erreichbar), wird genau dieser
 * hochgeladen — nicht neu aus inzwischen evtl. gekürzten Logs gebaut.
 */

import { PREP_RECAPS_CACHE_KEY } from "../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeWriteLocalStorageJson } from "../persistence/safeLocalStorage";
import {
  insertPrepRecapIfAbsent,
  loadPrepRecaps,
  updatePrepRecapFinishTime,
  updatePrepRecapStats,
} from "../lib/supabase/services/prepRecapService";
import { PREP_RECAP_SCHEMA_VERSION, type PrepRecapStats } from "./buildPrepRecapSnapshot";
import type { DetectedRaceFinish } from "./detectRaceFinishTime";
import {
  applyPrepRecapUpdate,
  decidePrepRecapAction,
  type FinishTimePatch,
  type PrepRecapRecord,
} from "./prepRecapRecord";

export type PrepRecapStore = {
  /** null = Remote nicht erreichbar/nicht angemeldet. */
  loadRemote: () => Promise<PrepRecapRecord[] | null>;
  insertRemote: (record: PrepRecapRecord) => Promise<PrepRecapRecord | null>;
  updateRemoteStats: (raceDate: string, stats: PrepRecapStats, schemaVersion: number) => Promise<boolean>;
  updateRemoteFinish: (raceDate: string, finish: FinishTimePatch, opts: { onlyIfEmpty?: boolean }) => Promise<boolean>;
  readCache: () => Record<string, PrepRecapRecord>;
  writeCache: (cache: Record<string, PrepRecapRecord>) => void;
};

export function readPrepRecapCache(): Record<string, PrepRecapRecord> {
  const raw = safeReadLocalStorageJson<unknown>(PREP_RECAPS_CACHE_KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, PrepRecapRecord>) : {};
}

export function createPrepRecapStore(userId: string | null): PrepRecapStore {
  return {
    loadRemote: () => (userId ? loadPrepRecaps(userId) : Promise.resolve(null)),
    insertRemote: (record) => (userId ? insertPrepRecapIfAbsent(userId, record) : Promise.resolve(null)),
    updateRemoteStats: (raceDate, stats, schemaVersion) =>
      userId ? updatePrepRecapStats(userId, raceDate, stats, schemaVersion) : Promise.resolve(false),
    updateRemoteFinish: (raceDate, finish, opts) =>
      userId ? updatePrepRecapFinishTime(userId, raceDate, finish, opts) : Promise.resolve(false),
    readCache: readPrepRecapCache,
    writeCache: (cache) => safeWriteLocalStorageJson(PREP_RECAPS_CACHE_KEY, cache),
  };
}

function cacheRecord(store: PrepRecapStore, record: PrepRecapRecord): void {
  const cache = store.readCache();
  store.writeCache({ ...cache, [record.raceDate]: record });
}

export async function ensurePrepRecapSnapshot(args: {
  store: PrepRecapStore;
  planId: string | null;
  raceName: string | null;
  raceDate: string;
  buildStats: () => PrepRecapStats;
  detectedFinish: DetectedRaceFinish | null;
  currentSchemaVersion?: number;
}): Promise<PrepRecapRecord> {
  const { store, raceDate } = args;
  const version = args.currentSchemaVersion ?? PREP_RECAP_SCHEMA_VERSION;

  const remoteList = await store.loadRemote();
  const remoteReachable = remoteList != null;
  const cached = store.readCache()[raceDate] ?? null;
  let existing: PrepRecapRecord | null = remoteList?.find((r) => r.raceDate === raceDate) ?? null;

  // Nur lokal vorhanden (früher offline angelegt) → genau diesen Snapshot nachreichen.
  if (!existing && cached && remoteReachable) {
    existing = (await store.insertRemote(cached)) ?? cached;
  } else if (!existing) {
    existing = cached;
  } else if (
    remoteReachable &&
    cached?.finishTimeConfirmed &&
    cached.finishTimeSeconds != null &&
    cached.finishTimeSource != null &&
    !existing.finishTimeConfirmed
  ) {
    // Offline bestätigte Zeit hat Vorrang vor einem unbestätigten Remote-Stand (eine remote bereits
    // bestätigte Zeit — z. B. von einem anderen Gerät — gewinnt dagegen).
    const finish: FinishTimePatch = { seconds: cached.finishTimeSeconds, source: cached.finishTimeSource, confirmed: true };
    await store.updateRemoteFinish(raceDate, finish, {});
    existing = {
      ...existing,
      finishTimeSeconds: finish.seconds,
      finishTimeSource: finish.source,
      finishTimeConfirmed: true,
    };
  }

  const action = decidePrepRecapAction({
    existing,
    buildStats: args.buildStats,
    detectedFinish: args.detectedFinish,
    planId: args.planId,
    raceName: args.raceName,
    raceDate,
    currentSchemaVersion: version,
  });

  if (action.kind === "create") {
    const stored = remoteReachable ? await store.insertRemote(action.record) : null;
    const record = stored ?? action.record;
    cacheRecord(store, record);
    return record;
  }

  if (action.kind === "none") {
    const record = existing as PrepRecapRecord;
    cacheRecord(store, record);
    return record;
  }

  const base = existing as PrepRecapRecord;
  if (remoteReachable) {
    if (action.stats) await store.updateRemoteStats(raceDate, action.stats, version);
    if (action.finish) await store.updateRemoteFinish(raceDate, action.finish, { onlyIfEmpty: true });
  }
  const record = applyPrepRecapUpdate(base, action, version);
  cacheRecord(store, record);
  return record;
}

/**
 * Zielzeit vom Athleten setzen (Bestätigen oder Ändern im Rückblick). Überschreibt immer —
 * das ist die bewusste Nutzerentscheidung, anders als der automatische Health-Nachtrag.
 */
export async function savePrepRecapFinishTime(args: {
  store: PrepRecapStore;
  record: PrepRecapRecord;
  finish: FinishTimePatch;
}): Promise<PrepRecapRecord> {
  const { store, record, finish } = args;
  await store.updateRemoteFinish(record.raceDate, finish, {});
  const next: PrepRecapRecord = {
    ...record,
    finishTimeSeconds: Math.round(finish.seconds),
    finishTimeSource: finish.source,
    finishTimeConfirmed: finish.confirmed,
  };
  cacheRecord(store, next);
  return next;
}
