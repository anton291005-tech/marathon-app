/**
 * Recovery Display State — normalisation layer between data layer and UI.
 *
 * Purpose:
 *   Prevent the UI from treating raw strings (including error placeholders and
 *   fallback text) as valid live data. Every sleep/recovery value must pass
 *   through this layer before it is rendered.
 *
 * This module is UI-boundary-only:
 *   - No scoring logic lives here.
 *   - No Apple Health ingestion logic lives here.
 *   - No storage or state management lives here.
 *
 * Usage:
 *   const state = normalizeSleep7dDisplay(sleep7dDisplay, fallback7d);
 *   switch (state.type) {
 *     case "live":     return state.value;   // formatted string e.g. "7h 12m"
 *     case "fallback": return state.value;   // fallback avg + trend string
 *     case "empty":    return "Keine Daten verfügbar";
 *     case "error":    return state.reason;  // only for explicit system failures
 *   }
 */

/** Discriminated union — the four explicit UI states for any recovery display value. */
export type RecoveryDisplayState =
  | { type: "live"; value: string }
  | { type: "fallback"; value: string }
  | { type: "empty" }
  | { type: "error"; reason: string };

/**
 * Fine-grained HealthKit permission state — replaces the legacy `boolean | null` trio.
 *
 * unknown     — not yet checked (initial mount, before first async checkAuthorization)
 * granted     — user has granted access (maps to legacy `true`)
 * denied      — user explicitly denied or not-determined (maps to legacy `false`)
 * unavailable — HealthKit is not available on this device / platform
 */
export type PermissionState = "unknown" | "granted" | "denied" | "unavailable";

/**
 * Deterministic, mutually-exclusive recovery signal UI state.
 * Derived once in App and passed down — the card never branches on anything else.
 *
 * loading         — permission not yet checked (initial mount); render skeleton / "—" only
 * has_data        — real data exists; `value` carries the formatted display string
 * no_data         — permission granted but no samples in the look-back window
 * permission_denied — the user explicitly denied this HealthKit type
 * unavailable     — HealthKit is not available on this device / platform
 */
export type RecoverySignalStatus =
  | { kind: "loading" }
  | { kind: "has_data"; value: string }
  | { kind: "no_data" }
  | { kind: "permission_denied" }
  | { kind: "unavailable" };

/** @deprecated Use RecoverySignalStatus */
export type SleepStatus = RecoverySignalStatus;

/** Minimal structural type for the sleep fallback breakdown. */
type SleepFallbackInput = { sleepAvg: string | number; sleepTrend: string } | null | undefined;

/**
 * Normalise a legacy `boolean | null` permission value to the canonical `PermissionState`.
 * - `true`  → "granted"
 * - `false` → "denied"
 * - `null`  → "unknown"  (checked by the caller; null before first async check is unknown)
 */
function toPermissionState(permission: PermissionState | boolean | null): PermissionState {
  if (permission === true)  return "granted";
  if (permission === false) return "denied";
  if (permission === null)  return "unknown";
  return permission;
}

/**
 * Generic signal deriver — for signals that have a pre-formatted display value (HRV, RHR, …).
 * Rules (priority order):
 *   1. permission === "unknown"           → loading  (not yet checked; never show error state)
 *   2. Non-empty displayValue             → has_data
 *   3. permission === "denied"            → permission_denied
 *   4. permission === "unavailable"       → unavailable
 *   5. otherwise                          → no_data
 *
 * Accepts both the new `PermissionState` and the legacy `boolean | null` for backward compat.
 */
export function deriveSignalStatus(
  displayValue: string | null | undefined,
  permission: PermissionState | boolean | null,
): RecoverySignalStatus {
  const perm = toPermissionState(permission);
  if (perm === "unknown") return { kind: "loading" };
  if (typeof displayValue === "string" && displayValue.trim().length > 0) {
    return { kind: "has_data", value: displayValue };
  }
  if (perm === "denied")      return { kind: "permission_denied" };
  if (perm === "unavailable") return { kind: "unavailable" };
  return { kind: "no_data" };
}

/**
 * Sleep-specific deriver — handles live vs. fallback resolution via normalizeSleep7dDisplay.
 * Rules (priority order):
 *   1. permission === "unknown"            → loading  (not yet checked)
 *   2. Any usable data (live or fallback)  → has_data
 *   3. permission === "denied"             → permission_denied
 *   4. permission === "unavailable"        → unavailable
 *   5. otherwise                           → no_data
 *
 * Accepts both the new `PermissionState` and the legacy `boolean | null` for backward compat.
 */
export function deriveSleepStatus(
  sleep7dDisplay: string | null | undefined,
  fallback7d: SleepFallbackInput,
  sleepPermission: PermissionState | boolean | null,
): RecoverySignalStatus {
  const perm = toPermissionState(sleepPermission);
  if (perm === "unknown") return { kind: "loading" };
  const state = normalizeSleep7dDisplay(sleep7dDisplay, fallback7d);
  if (state.type === "live" || state.type === "fallback") {
    return { kind: "has_data", value: state.value };
  }
  if (perm === "denied")      return { kind: "permission_denied" };
  if (perm === "unavailable") return { kind: "unavailable" };
  return { kind: "no_data" };
}

/**
 * Known placeholder / error strings that must NEVER be classified as live data.
 * Populated defensively to guard against historical code paths re-introducing them.
 */
const PLACEHOLDER_STRINGS: ReadonlySet<string> = new Set([
  "Keine Daten verfügbar (Apple Health Sync fehlt)",
  "Apple Health Sync fehlt",
  "Keine Daten verfügbar",
]);

/**
 * Returns true only for a string that contains actual user-facing data
 * (non-empty, non-whitespace, not a known placeholder).
 */
function isValidLiveString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (t.length === 0) return false;
  if (PLACEHOLDER_STRINGS.has(t)) return false;
  return true;
}

/** Minimal structural type — only the sleep fields needed for fallback display. */
type SleepFallback = {
  sleepAvg: string | number;
  sleepTrend: string;
};

/**
 * Normalise the sleep 7-day display value into an explicit RecoveryDisplayState.
 *
 * Priority:
 *   1. live   — valid, non-placeholder string from Apple Health aggregation
 *   2. fallback — fallback7d breakdown exists
 *   3. empty  — no usable data
 *
 * "error" is reserved for explicit system-failure signals; it is NOT produced
 * by this function (absent data is "empty", not "error").
 */
export function normalizeSleep7dDisplay(
  input: string | null | undefined,
  fallback7d: SleepFallback | null | undefined,
): RecoveryDisplayState {
  if (isValidLiveString(input)) {
    return { type: "live", value: input };
  }
  if (fallback7d) {
    const value = `${fallback7d.sleepAvg} ${fallback7d.sleepTrend}`.trim();
    return { type: "fallback", value };
  }
  return { type: "empty" };
}
