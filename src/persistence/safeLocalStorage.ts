/**
 * Defensive localStorage access for iOS WKWebView boot (quota / privacy / transient failures).
 */
export function safeReadLocalStorageItem(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWriteLocalStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy mode
  }
}

export function safeRemoveLocalStorageItem(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function safeReadLocalStorageJson<T>(key: string, fallback: T): T {
  const raw = safeReadLocalStorageItem(key);
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeWriteLocalStorageJson(key: string, value: unknown): void {
  safeWriteLocalStorageItem(key, JSON.stringify(value));
}
