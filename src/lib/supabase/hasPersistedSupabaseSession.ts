type StoredAuthPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  currentSession?: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_at?: unknown;
  };
};

function sessionPayloadLooksAuthenticated(payload: StoredAuthPayload): boolean {
  const accessToken =
    typeof payload.access_token === "string"
      ? payload.access_token
      : typeof payload.currentSession?.access_token === "string"
        ? payload.currentSession.access_token
        : "";
  if (accessToken.trim().length > 0) return true;

  const refreshToken =
    typeof payload.refresh_token === "string"
      ? payload.refresh_token
      : typeof payload.currentSession?.refresh_token === "string"
        ? payload.currentSession.refresh_token
        : "";
  return refreshToken.trim().length > 0;
}

/** True when GoTrue auth state is present in localStorage (sync boot check). */
export function hasPersistedSupabaseSession(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as StoredAuthPayload;
      if (sessionPayloadLooksAuthenticated(parsed)) return true;
    }
  } catch {
    // ignore parse / storage errors
  }
  return false;
}

export function isBootIsolateRequested(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("boot") === "ok") return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("BOOT_ISOLATE") === "1") {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Boot isolation is debug-only and must not block authenticated users. */
export function shouldBootIsolate(): boolean {
  return isBootIsolateRequested() && !hasPersistedSupabaseSession();
}
