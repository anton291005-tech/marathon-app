/**
 * Zustand des Schicht-Modus für die ganze App (eine Quelle für AppMain, Wizard-Frage und Dienstplan-Seite).
 *
 * Lokal zuerst, dann Supabase — wie der Morgen-Check-in: Einträge landen sofort im lokalen Cache und gelten sofort;
 * der Server-Stand gewinnt beim Laden, außer für Tage, die lokal noch nicht gespeichert sind (`pending`). Fehlt die
 * Tabelle (Migration 023 nicht angewendet), bleibt alles lokal und die Seite zeigt einen ruhigen Hinweis.
 *
 * ENTSCHEIDUNG (Anton absegnen): Ohne Tabelle wirkt der Dienstplan trotzdem (nur auf diesem Gerät) statt gar nicht;
 * sobald die Tabelle da ist, werden ausstehende Tage beim nächsten Laden nachgereicht.
 */
import {
  deleteShiftEntries,
  loadShiftEntries,
  upsertShiftEntries,
  type StoredShiftEntry,
} from "../lib/supabase/services/shiftEntriesService";
import { loadShiftProfile, saveShiftProfile, sanitizeShiftDefaults, type ShiftDefaultTimes } from "../lib/supabase/services/shiftProfileService";
import { SHIFT_ENTRIES_CACHE_KEY, SHIFT_INTRO_DISMISSED_KEY, SHIFT_PROFILE_CACHE_KEY } from "../persistence/marathonLocalStorageKeys";
import { safeReadLocalStorageJson, safeReadLocalStorageItem, safeWriteLocalStorageItem, safeWriteLocalStorageJson } from "../persistence/safeLocalStorage";
import { addDays } from "../planCore/dates";
import { CONFIG } from "../readinessCore/config";
import { reportShiftUsage } from "./shiftUsage";

export type ShiftRemoteStatus = "idle" | "loading" | "ok" | "unavailable" | "error";

export type ShiftState = {
  userId: string | null;
  entriesStatus: ShiftRemoteStatus;
  profileStatus: ShiftRemoteStatus;
  /** Alle bekannten Einträge je Tag (lokal + Server). */
  entriesByDate: Readonly<Record<string, StoredShiftEntry>>;
  worksShifts: boolean | null;
  defaults: ShiftDefaultTimes | null;
  introDismissed: boolean;
};

type EntriesCache = {
  userId: string;
  entries: Record<string, StoredShiftEntry>;
  /** Tage, deren Änderung (Eintrag oder Löschung) noch nicht in Supabase steht. */
  pending: string[];
};

type ProfileCache = { userId: string; worksShifts: boolean | null; defaults: ShiftDefaultTimes | null; pending: boolean };

const EMPTY: ShiftState = {
  userId: null,
  entriesStatus: "idle",
  profileStatus: "idle",
  entriesByDate: {},
  worksShifts: null,
  defaults: null,
  introDismissed: false,
};

let state: ShiftState = EMPTY;
let listeners: Array<() => void> = [];
let loadToken = 0;

function emit(patch: Partial<ShiftState>): void {
  state = { ...state, ...patch };
  listeners.slice().forEach((listener) => listener());
}

export function getShiftState(): ShiftState {
  return state;
}

export function subscribeShiftState(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** Nur für Tests. */
export function resetShiftStateForTests(): void {
  state = EMPTY;
  listeners = [];
  loadToken += 1;
}

/**
 * Cache-Schlüssel je Nutzer (`marathonShiftEntries:<userId>`): ausstehende Tage eines Kontos können nie in ein anderes
 * Konto auf demselben Gerät geschrieben werden. Das Aufräumen beim Kontowechsel übernimmt die Integration (W3).
 */
export function shiftEntriesCacheKey(userId: string): string {
  return `${SHIFT_ENTRIES_CACHE_KEY}:${userId}`;
}

export function shiftProfileCacheKey(userId: string): string {
  return `${SHIFT_PROFILE_CACHE_KEY}:${userId}`;
}

function readEntriesCache(userId: string): EntriesCache {
  const raw = safeReadLocalStorageJson<Partial<EntriesCache> | null>(shiftEntriesCacheKey(userId), null);
  if (!raw || raw.userId !== userId || !raw.entries || typeof raw.entries !== "object") return { userId, entries: {}, pending: [] };
  return { userId, entries: { ...raw.entries }, pending: Array.isArray(raw.pending) ? raw.pending.filter((d) => typeof d === "string") : [] };
}

function writeEntriesCache(cache: EntriesCache): void {
  safeWriteLocalStorageJson(shiftEntriesCacheKey(cache.userId), cache);
}

function readProfileCache(userId: string): ProfileCache {
  const raw = safeReadLocalStorageJson<Partial<ProfileCache> | null>(shiftProfileCacheKey(userId), null);
  if (!raw || raw.userId !== userId) return { userId, worksShifts: null, defaults: null, pending: false };
  return {
    userId,
    worksShifts: typeof raw.worksShifts === "boolean" ? raw.worksShifts : null,
    defaults: sanitizeShiftDefaults(raw.defaults),
    pending: raw.pending === true,
  };
}

function writeProfileCache(cache: ProfileCache): void {
  safeWriteLocalStorageJson(shiftProfileCacheKey(cache.userId), cache);
}

function readIntroDismissed(userId: string): boolean {
  return safeReadLocalStorageItem(SHIFT_INTRO_DISMISSED_KEY) === userId;
}

/** Ladebereich: eine Woche zurück (Nachwirkung von Nachtdiensten) bis zum Ende der Vorausschau plus eine Woche. */
export function shiftLoadRange(todayYmd: string): { fromYmd: string; toYmd: string } {
  return { fromYmd: addDays(todayYmd, -7), toYmd: addDays(todayYmd, CONFIG.shift.horizonDays.value + 7) };
}

async function flushPending(userId: string): Promise<"ok" | "unavailable" | "error"> {
  const cache = readEntriesCache(userId);
  if (cache.pending.length === 0) return "ok";
  const upserts = cache.pending.map((d) => cache.entries[d]).filter((e): e is StoredShiftEntry => !!e);
  const deletes = cache.pending.filter((d) => !cache.entries[d]);
  const up = await upsertShiftEntries(userId, upserts);
  if (up.status !== "ok") return up.status;
  const del = await deleteShiftEntries(userId, deletes);
  if (del.status !== "ok") return del.status;
  const after = readEntriesCache(userId);
  writeEntriesCache({ ...after, pending: after.pending.filter((d) => cache.pending.indexOf(d) < 0) });
  return "ok";
}

/** Lädt Einträge und Profil für `userId`; ohne Nutzer leert es den Zustand. Mehrfache Aufrufe: der letzte gewinnt. */
export async function loadShiftData(userId: string | null, todayYmd: string): Promise<void> {
  const token = (loadToken += 1);
  if (!userId) {
    emit({ ...EMPTY });
    return;
  }
  const localEntries = readEntriesCache(userId);
  const localProfile = readProfileCache(userId);
  emit({
    userId,
    entriesStatus: "loading",
    profileStatus: "loading",
    entriesByDate: localEntries.entries,
    worksShifts: localProfile.worksShifts,
    defaults: localProfile.defaults,
    introDismissed: readIntroDismissed(userId),
  });

  // Profil
  const profile = await loadShiftProfile(userId);
  if (token !== loadToken) return;
  if (profile.status === "ok") {
    const local = readProfileCache(userId);
    if (local.pending) {
      // Lokal gewählte Antwort (z. B. als die Spalte noch fehlte) nachreichen.
      const saved = await saveShiftProfile(userId, { worksShifts: local.worksShifts, defaults: local.defaults });
      if (token !== loadToken) return;
      if (saved === "ok") writeProfileCache({ ...local, pending: false });
      emit({ profileStatus: "ok" });
    } else {
      writeProfileCache({ userId, worksShifts: profile.value.worksShifts, defaults: profile.value.defaults, pending: false });
      emit({ profileStatus: "ok", worksShifts: profile.value.worksShifts, defaults: profile.value.defaults });
    }
  } else {
    emit({ profileStatus: profile.status });
  }

  // Einträge
  const flushed = await flushPending(userId);
  if (token !== loadToken) return;
  if (flushed === "unavailable") {
    emit({ entriesStatus: "unavailable" });
    return;
  }
  const range = shiftLoadRange(todayYmd);
  const remote = await loadShiftEntries(userId, range.fromYmd, range.toYmd);
  if (token !== loadToken) return;
  if (remote.status !== "ok") {
    emit({ entriesStatus: remote.status });
    return;
  }
  const cache = readEntriesCache(userId);
  const merged: Record<string, StoredShiftEntry> = {};
  // Außerhalb des Ladebereichs bleibt der lokale Stand; innerhalb gilt der Server, außer für ausstehende Tage.
  Object.keys(cache.entries).forEach((d) => {
    if (d < range.fromYmd || d > range.toYmd || cache.pending.indexOf(d) >= 0) merged[d] = cache.entries[d];
  });
  remote.value.forEach((entry) => {
    if (cache.pending.indexOf(entry.dateYmd) < 0) merged[entry.dateYmd] = entry;
  });
  writeEntriesCache({ userId, entries: merged, pending: cache.pending });
  emit({ entriesStatus: "ok", entriesByDate: merged });
}

export type SaveShiftEntriesResult = { remote: "ok" | "unavailable" | "error"; count: number };

/** Übernimmt Änderungen sofort lokal und speichert sie dann in einem Bulk-Upsert (+ Löschungen). */
export async function saveShiftChanges(changes: { upserts: StoredShiftEntry[]; deletes: string[] }): Promise<SaveShiftEntriesResult> {
  const userId = state.userId;
  if (!userId) return { remote: "error", count: 0 };
  const cache = readEntriesCache(userId);
  const touched: string[] = [];
  changes.upserts.forEach((entry) => {
    cache.entries[entry.dateYmd] = entry;
    touched.push(entry.dateYmd);
  });
  changes.deletes.forEach((date) => {
    if (changes.upserts.some((e) => e.dateYmd === date)) return;
    delete cache.entries[date];
    touched.push(date);
  });
  const pending = cache.pending.slice();
  touched.forEach((d) => {
    if (pending.indexOf(d) < 0) pending.push(d);
  });
  writeEntriesCache({ userId, entries: cache.entries, pending });
  emit({ entriesByDate: { ...cache.entries } });

  // Ein Tag in beiden Listen: der Eintrag gewinnt (oben ebenso).
  const up = await upsertShiftEntries(userId, changes.upserts);
  let remote: SaveShiftEntriesResult["remote"] = up.status === "ok" ? "ok" : up.status;
  if (remote === "ok") {
    const deletes = changes.deletes.filter((d) => !changes.upserts.some((e) => e.dateYmd === d));
    const del = await deleteShiftEntries(userId, deletes);
    remote = del.status === "ok" ? "ok" : del.status;
  }
  if (remote === "ok") {
    const after = readEntriesCache(userId);
    writeEntriesCache({ ...after, pending: after.pending.filter((d) => touched.indexOf(d) < 0) });
  }
  if (state.userId === userId) emit({ entriesStatus: remote === "ok" ? "ok" : remote });
  reportShiftUsage("shift_entries_saved", { count: touched.length, remote: remote === "ok" });
  return { remote, count: touched.length };
}

/** Antwort „Arbeitest du in Schichten?“ (Wizard, Karte, Einstellungen). Lokal sofort, Server danach. */
export async function setWorksShifts(value: boolean): Promise<"ok" | "unavailable" | "error"> {
  const userId = state.userId;
  if (!userId) return "error";
  const local = readProfileCache(userId);
  writeProfileCache({ ...local, worksShifts: value, pending: true });
  emit({ worksShifts: value });
  const saved = await saveShiftProfile(userId, { worksShifts: value });
  if (saved === "ok") writeProfileCache({ ...readProfileCache(userId), pending: false });
  return saved;
}

/** Eigene Standardzeiten der Chips. */
export async function setShiftDefaults(defaults: ShiftDefaultTimes | null): Promise<"ok" | "unavailable" | "error"> {
  const userId = state.userId;
  if (!userId) return "error";
  const clean = sanitizeShiftDefaults(defaults);
  const local = readProfileCache(userId);
  writeProfileCache({ ...local, defaults: clean, pending: true });
  emit({ defaults: clean });
  const saved = await saveShiftProfile(userId, { defaults: clean });
  if (saved === "ok") writeProfileCache({ ...readProfileCache(userId), pending: false });
  return saved;
}

/** Karte „Arbeitest du in Schichten?“ auf „Heute“ weggeklickt (nur lokal, je Nutzer). */
export function dismissShiftIntro(): void {
  if (!state.userId) return;
  safeWriteLocalStorageItem(SHIFT_INTRO_DISMISSED_KEY, state.userId);
  emit({ introDismissed: true });
}
