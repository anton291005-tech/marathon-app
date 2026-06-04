import { getAppNowEpochMs } from "../../../core/time/timeSystem";

const STORAGE_KEY = "marathon.coachMemory.v1";

type CoachMemoryRemoteSyncConfig = {
  userId: string | null;
  ready: boolean;
};

let coachMemoryRemoteSync: CoachMemoryRemoteSyncConfig = { userId: null, ready: false };

/** Called from `AppMain` so `setCoachMemory` can push after local persistence (no React dependency on AI modules). */
export function configureCoachMemoryRemoteSync(config: CoachMemoryRemoteSyncConfig): void {
  coachMemoryRemoteSync = config;
}

/** In-memory fallback when localStorage is unavailable (SSR / WebView edge cases). */
let memoryFallback: CoachMemory | null = null;

export type CoachMemory = {
  fatigueBias: number;
  restPreference: number;
  adaptationLevel: number;
  lastAdjustmentType: "increase" | "decrease" | "none";
  consecutiveHardDays: number;
  lastUpdated: number;
};

/** Static defaults; `lastUpdated` is refreshed on read/write via `getAppNowEpochMs()`. */
export const defaultCoachMemory: CoachMemory = {
  fatigueBias: 0,
  restPreference: 0.5,
  adaptationLevel: 0.5,
  lastAdjustmentType: "none",
  consecutiveHardDays: 0,
  lastUpdated: 0,
};

function cloneDefault(): CoachMemory {
  return {
    ...defaultCoachMemory,
    lastUpdated: getAppNowEpochMs(),
  };
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function sanitizeMemory(raw: unknown): CoachMemory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return cloneDefault();
  }
  const o = raw as Record<string, unknown>;

  const fatigueBias = isFiniteNum(o.fatigueBias) ? Math.min(1, Math.max(-1, o.fatigueBias)) : 0;
  const restPreference = isFiniteNum(o.restPreference) ? Math.min(1, Math.max(0, o.restPreference)) : 0.5;
  const adaptationLevel = isFiniteNum(o.adaptationLevel) ? Math.min(1, Math.max(0, o.adaptationLevel)) : 0.5;
  const lastAdjustmentType =
    o.lastAdjustmentType === "increase" || o.lastAdjustmentType === "decrease" || o.lastAdjustmentType === "none"
      ? o.lastAdjustmentType
      : "none";
  const consecutiveHardDays = isFiniteNum(o.consecutiveHardDays)
    ? Math.min(365, Math.max(0, Math.floor(o.consecutiveHardDays)))
    : 0;
  const lastUpdated =
    isFiniteNum(o.lastUpdated) && o.lastUpdated > 0 ? o.lastUpdated : getAppNowEpochMs();

  return {
    fatigueBias,
    restPreference,
    adaptationLevel,
    lastAdjustmentType,
    consecutiveHardDays,
    lastUpdated,
  };
}

/** Read persisted coaching memory — safe fallback to defaults if missing or corrupt. */
export function getCoachMemory(): CoachMemory {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw) as unknown;
        return sanitizeMemory(parsed);
      }
    }
  } catch {
    // fall through
  }

  if (memoryFallback) {
    try {
      return sanitizeMemory(memoryFallback);
    } catch {
      memoryFallback = null;
    }
  }

  return cloneDefault();
}

function maybePersistCoachMemoryRemote(safe: CoachMemory): void {
  const ctx = coachMemoryRemoteSync;
  const uid = ctx.userId;
  if (!ctx.ready || !uid) return;
  void import("../../supabase/services/coachMemoryService").then(({ saveCoachMemory }) => {
    void saveCoachMemory(uid, safe);
  });
}

/** Persist coaching memory — never throws to callers. */
export function setCoachMemory(memory: CoachMemory): void {
  try {
    const safe = sanitizeMemory(memory);
    safe.lastUpdated = getAppNowEpochMs();
    const payload = JSON.stringify(safe);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, payload);
    } else {
      memoryFallback = safe;
    }
    maybePersistCoachMemoryRemote(safe);
  } catch {
    try {
      memoryFallback = sanitizeMemory(memory);
      maybePersistCoachMemoryRemote(memoryFallback);
    } catch {
      memoryFallback = cloneDefault();
      maybePersistCoachMemoryRemote(memoryFallback);
    }
  }
}
