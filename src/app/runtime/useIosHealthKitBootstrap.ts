import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getAppNowEpochMs } from "../../core/time/timeSystem";
import type { HealthKitAuthState } from "../../health/healthDataService";
import {
  appleHealthCheckPermission,
  buildHealthKitAuthState,
  healthKitFetchRecoveryDailyLast120Days,
  healthKitIsAvailable,
  healthKitRequestReadAuthorization,
  shouldForceFullHealthKitReauth,
} from "../../health/healthDataService";
import { mergeRecoveryDailyPersisted } from "../../recovery/recoveryStorage";
import type { RecoveryDailyRow } from "../../recovery/recoveryTypes";
import type { PermissionState } from "../../recovery/recoveryDisplayState";

/**
 * Session guard: requestAuthorization executes at most ONCE per JS context lifetime (= one cold start).
 * Moved from `App.tsx` with identical semantics.
 */
let hasTriggeredHealthKitAuthThisSession = false;

/**
 * Explicit façade wired from `App.tsx`: permission setters + workout sync callback + recovery merge reducer.
 * Hydration orchestration stays **inside** the mount-only effect (historical parity — not injected).
 */
export interface IosHealthKitBootstrapApi {
  readonly appleHealthConnectedStorageKey: string;
  readonly setHealthKitAvailable: Dispatch<SetStateAction<boolean | null>>;
  readonly setSleepPermission: Dispatch<SetStateAction<PermissionState>>;
  readonly setHrvPermission: Dispatch<SetStateAction<PermissionState>>;
  readonly setRhrPermission: Dispatch<SetStateAction<PermissionState>>;
  readonly setIsHealthConnected: Dispatch<SetStateAction<boolean>>;
  readonly setRecoveryDailyRows: Dispatch<SetStateAction<RecoveryDailyRow[]>>;
  /** After `mergeRecoveryDailyPersisted(prev, incoming)` when HealthKit returns rows (mount / retry). */
  readonly onRecoveryDailyMerged?: (next: RecoveryDailyRow[], incoming: RecoveryDailyRow[]) => void;
  readonly fetchRunningWorkoutsLast7Days: (options?: { forceLastThreeCalendarDays?: boolean }) => Promise<number>;
}

/**
 * iOS cold-start HealthKit availability + recovery hydration bootstrap (**mount-only** effect).
 *
 * ## Invarianten (Absicht — nicht „eslint reparieren“)
 *
 * - **`[]` deps sind ABSICHTLICH**: Der async-IIFE läuft **genau einmal pro Mount**. Das ist das historische
 *   Verhalten aus dem früheren `App.tsx`-Inline-Effekt.
 * - **`react-hooks/exhaustive-deps` ist absichtlich deaktiviert** (siehe eslint-Zeile am Effekt): Dependency-Erweiterung
 *   wäre eine Verhaltensänderung, kein „Fix“.
 * - **Stale closures sind akzeptiert**: Es werden nur Referenzen aus dem **ersten Render** verwendet; spätere
 *   Render‑Identitäten von Settern/`fetchRunningWorkoutsLast7Days` werden ignoriert (bewusst).
 * - **Erste Render‑Referenzen sind gewollt**: Neuere Callback-Implementierungen nach Mount werden nicht nachgezogen.
 *
 * ### Was passiert bei Re-Runs des Effekts (deshalb verboten)?
 *
 * Würde der Effekt durch geänderte Deps erneut laufen, entstünden typischerweise:
 *
 * - **doppelte Hydration** (`healthKitFetchRecoveryDailyLast120Days` + Recovery-Merge mehrfach),
 * - **doppelte HealthKit‑Probes** (`healthKitIsAvailable`, Permission-Checks, optional erneuter Auth‑Pfad),
 * - **Retry‑Timer‑Duplikate** (mehrere `1700ms`‑Timeouts überlagern sich),
 * - **Konflikte mit `hasTriggeredHealthKitAuthThisSession`** (Session-weites Gate vs. zweiter Bootstrap‑Pfad).
 *
 * ---
 *
 * ```
 * ███ DO NOT CONVERT (Phase 1F guardrails — requires explicit Phase-2 sign-off) ███
 * - Do NOT replace the mount-only effect with "sync API to refs each render + read refs inside async":
 *   that can change which `fetchRunningWorkoutsLast7Days` runs after late re-renders.
 * - Do NOT reset `hasTriggeredHealthKitAuthThisSession` from React lifecycle (module scope is intentional).
 * - Do NOT change the recovery hydration retry delay (`1700` ms) or the "single retry" shape.
 * - Do NOT add dependency arrays that re-enter this effect on each render (state setters are unstable).
 * - **`onRecoveryDailyMerged`**: optional hook for callers to observe merged recovery rows (e.g. remote sync).
 *   Invoked synchronously inside the `setRecoveryDailyRows` reducer after merge when incoming count > 0.
 * ```
 */
export function useIosHealthKitBootstrap(api: IosHealthKitBootstrapApi): void {
  const {
    appleHealthConnectedStorageKey,
    setHealthKitAvailable,
    setSleepPermission,
    setHrvPermission,
    setRhrPermission,
    setIsHealthConnected,
    setRecoveryDailyRows,
    onRecoveryDailyMerged,
    fetchRunningWorkoutsLast7Days,
  } = api;

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const ok = await healthKitIsAvailable();
        if (cancelled) return;
        setHealthKitAvailable(ok);
        if (!ok) {
          setSleepPermission("unavailable");
          setHrvPermission("unavailable");
          setRhrPermission("unavailable");
          return;
        }

        let launchAuthState: HealthKitAuthState = buildHealthKitAuthState("unknown", "unknown", "unknown");

        if (!hasTriggeredHealthKitAuthThisSession) {
          try {
            const toPS = (v: boolean | null): PermissionState =>
              v === true ? "granted" : v === false ? "denied" : v === null ? "unavailable" : "unknown";

            const [sOk, hOk, rOk] = await Promise.all([
              appleHealthCheckPermission("sleep"),
              appleHealthCheckPermission("heartRateVariability"),
              appleHealthCheckPermission("restingHeartRate"),
            ]);
            launchAuthState = buildHealthKitAuthState(toPS(sOk), toPS(hOk), toPS(rOk));

            const triggerReauth = shouldForceFullHealthKitReauth(launchAuthState);
            const perms = [launchAuthState.sleep, launchAuthState.hrv, launchAuthState.rhr];
            const reason: "initial" | "missing_permissions" | "legacy_partial" | "unknown_state" =
              !triggerReauth
                ? "initial"
                : perms.some((p) => p === "unknown")
                  ? "unknown_state"
                  : perms.every((p) => p !== "granted")
                    ? "missing_permissions"
                    : "legacy_partial";

            // eslint-disable-next-line no-console
            console.log(
              "[HEALTHKIT_AUTH_CYCLE]",
              JSON.stringify({
                sleep: launchAuthState.sleep,
                hrv: launchAuthState.hrv,
                rhr: launchAuthState.rhr,
                fullyAuthorized: launchAuthState.fullyAuthorized,
                triggeredReauth: triggerReauth,
                reason,
              }),
            );

            if (triggerReauth && !cancelled) {
              hasTriggeredHealthKitAuthThisSession = true;
              await healthKitRequestReadAuthorization();
              localStorage.setItem(appleHealthConnectedStorageKey, "1");
              if (!cancelled) setIsHealthConnected(true);

              if (!cancelled) {
                const [sOk2, hOk2, rOk2] = await Promise.all([
                  appleHealthCheckPermission("sleep"),
                  appleHealthCheckPermission("heartRateVariability"),
                  appleHealthCheckPermission("restingHeartRate"),
                ]);
                const postSleep = toPS(sOk2);
                const postHrv = toPS(hOk2);
                const postRhr = toPS(rOk2);
                launchAuthState = buildHealthKitAuthState(postSleep, postHrv, postRhr, getAppNowEpochMs());
                setSleepPermission(postSleep);
                setHrvPermission(postHrv);
                setRhrPermission(postRhr);
                // eslint-disable-next-line no-console
                console.log(
                  "[HEALTHKIT_AUTH_CYCLE]",
                  JSON.stringify({
                    phase: "post_reauth",
                    sleep: launchAuthState.sleep,
                    hrv: launchAuthState.hrv,
                    rhr: launchAuthState.rhr,
                    fullyAuthorized: launchAuthState.fullyAuthorized,
                    triggeredReauth: false,
                    reason: "post_reauth_sync",
                  }),
                );
              }
            }
          } catch (e) {
            console.warn("[appleHealthService] auth cycle failed", e);
          }
        }

        const hydrateRecoveryOnce = async (opts: {
          retryUsed: boolean;
          permissionsAtFetch?: { sleep: PermissionState; hrv: PermissionState; rhr: PermissionState };
        }) => {
          try {
            const recoveryIncoming = await healthKitFetchRecoveryDailyLast120Days();
            const count = recoveryIncoming.length;
            if (!cancelled && count > 0) {
              setRecoveryDailyRows((prev) => {
                const next = mergeRecoveryDailyPersisted(prev, recoveryIncoming);
                onRecoveryDailyMerged?.(next, recoveryIncoming);
                return next;
              });
            }
            const sleepRows = recoveryIncoming.filter((r) => typeof r.sleepHours === "number" && r.sleepHours > 0);
            const hrvRows = recoveryIncoming.filter((r) => typeof r.hrvMs === "number" && r.hrvMs > 0);
            const rhrRows = recoveryIncoming.filter((r) => typeof r.restingHr === "number" && r.restingHr > 0);
            // eslint-disable-next-line no-console
            console.log("[RECOVERY_PIPELINE][hydration]", {
              retryUsed: opts.retryUsed,
              resultCount: count,
              rowsWithSleep: sleepRows.length,
              rowsWithHRV: hrvRows.length,
              rowsWithRHR: rhrRows.length,
              hrvDaysUsed: hrvRows.length,
              rhrDaysUsed: rhrRows.length,
              sleepPermission: opts.permissionsAtFetch?.sleep ?? "unknown",
              hrvPermission: opts.permissionsAtFetch?.hrv ?? "unknown",
              rhrPermission: opts.permissionsAtFetch?.rhr ?? "unknown",
            });
            if (typeof process !== "undefined" && process.env.REACT_APP_RECOVERY_DEBUG === "1") {
              // eslint-disable-next-line no-console
              console.log("[RECOVERY_PIPELINE][hydration][detail]", {
                latestSleep: sleepRows.slice(-3).map((r) => ({ date: r.date, sleepHours: r.sleepHours })),
                latestHRV: hrvRows.slice(-3).map((r) => ({ date: r.date, hrvMs: r.hrvMs })),
                latestRHR: rhrRows.slice(-3).map((r) => ({ date: r.date, restingHr: r.restingHr })),
              });
            }
            return count;
          } catch {
            // eslint-disable-next-line no-console
            console.log("[RECOVERY_PIPELINE][hydration]", {
              retryUsed: opts.retryUsed,
              resultCount: 0,
              error: true,
              sleepPermission: opts.permissionsAtFetch?.sleep ?? "unknown",
              hrvPermission: opts.permissionsAtFetch?.hrv ?? "unknown",
              rhrPermission: opts.permissionsAtFetch?.rhr ?? "unknown",
            });
            return 0;
          }
        };

        if (launchAuthState.fullyAuthorized) {
          const permissionsAtFetch = {
            sleep: launchAuthState.sleep,
            hrv: launchAuthState.hrv,
            rhr: launchAuthState.rhr,
          };
          const firstCount = await hydrateRecoveryOnce({ retryUsed: false, permissionsAtFetch });
          if (!cancelled && firstCount === 0) {
            retryTimer = setTimeout(() => {
              if (cancelled) return;
              void hydrateRecoveryOnce({ retryUsed: true, permissionsAtFetch });
            }, 1700);
          }
        }

        if (localStorage.getItem(appleHealthConnectedStorageKey) === "1") {
          setIsHealthConnected(true);
          let resolvedSleep: PermissionState = "unknown";
          let resolvedHrv: PermissionState = "unknown";
          let resolvedRhr: PermissionState = "unknown";
          try {
            const [sleepOk, hrvOk, rhrOk] = await Promise.all([
              appleHealthCheckPermission("sleep"),
              appleHealthCheckPermission("heartRateVariability"),
              appleHealthCheckPermission("restingHeartRate"),
            ]);
            resolvedSleep = sleepOk === true ? "granted" : sleepOk === false ? "denied" : sleepOk === null ? "unavailable" : "unknown";
            resolvedHrv =
              hrvOk === true ? "granted" : hrvOk === false ? "denied" : hrvOk === null ? "unavailable" : "unknown";
            resolvedRhr =
              rhrOk === true ? "granted" : rhrOk === false ? "denied" : rhrOk === null ? "unavailable" : "unknown";
            setSleepPermission(resolvedSleep);
            setHrvPermission(resolvedHrv);
            setRhrPermission(resolvedRhr);
          } catch {
            // best-effort
          }
          try {
            await fetchRunningWorkoutsLast7Days();
          } catch (e) {
            // ignore (best-effort)
          }
        }
      } catch (e) {
        if (!cancelled) setHealthKitAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Mount-only invariant safe ([]): widening deps duplicates probes/hydration/retry timers and races `hasTriggeredHealthKitAuthThisSession`; stale-first-render closures intentional (docblock).
  }, []);
}
