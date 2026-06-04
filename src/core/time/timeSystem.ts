/**
 * Authoritative app clock — single wall-clock read per UI frame.
 * `new Date()` without arguments and `Date.now()` exist only here.
 */

let frameEpochMs: number;
let testFrozen: Date | null = null;

function refreshFromWallClock(): void {
  frameEpochMs = Date.now();
}

refreshFromWallClock();

/** Call once at the start of each `App` render so all `getAppNow()` share one instant. */
export function beginAppFrame(): void {
  if (testFrozen != null) return;
  refreshFromWallClock();
}

export function getAppNow(): Date {
  if (testFrozen != null) return new Date(testFrozen.getTime());
  return new Date(frameEpochMs);
}

export function getAppNowEpochMs(): number {
  if (testFrozen != null) return testFrozen.getTime();
  return frameEpochMs;
}

export function getAppTodayYmd(): string {
  return getAppCalendarYmd(getAppNow());
}

/** Local calendar YYYY-MM-DD for an arbitrary instant (no default — use getAppTodayYmd() for „today“). */
export function getAppCalendarYmd(from: Date): string {
  const ts = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`;
}

/** Jest / storybook: pin authoritative time. Pass `null` to resume wall clock. */
export function freezeTimeForTests(d: Date | null): void {
  testFrozen = d;
  if (d != null) frameEpochMs = d.getTime();
  else refreshFromWallClock();
}
