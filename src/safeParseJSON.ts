/**
 * JSON.parse boundary for persistence / hydration: never throws; returns fallback on null/empty/invalid JSON.
 */
export function safeParseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
