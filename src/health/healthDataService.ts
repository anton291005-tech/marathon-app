/**
 * Facade: Apple Health / HealthKit — keine UI, keine React-Hooks.
 * Recovery- und Workout-Sync starten hier; UI ruft nur diese Funktionen auf.
 */

export { appleHealthMissingCyclingDistance } from "../appleHealth/appleHealthPermissions";
export { loadHealthAnchors, saveHealthAnchors } from "../appleHealth/healthAnchorStore";
export {
  APPLE_HEALTH_READ_TYPES,
  appleHealthCheckPermission,
  appleHealthWorkoutQueryRange7DaysLocal,
  appleHealthWorkoutQueryRangeFromMidnightDaysBack,
  appleHealthWorkoutQueryRangeLastNCalendarDaysInclusive,
  buildHealthKitAuthState,
  healthKitFetchRecoveryDailyLast120Days,
  healthKitFetchRunningWorkoutsLast7Days,
  healthKitFetchWorkoutsForAppStorage,
  healthKitForceRefreshWorkoutsLast3Days,
  healthKitIsAvailable,
  healthKitRequestReadAuthorization,
  isHealthKitPermissionComplete,
  localCalendarStartOfDay,
  shouldForceFullHealthKitReauth,
} from "../appleHealth/appleHealthService";
export type { HealthKitAuthState } from "../appleHealth/appleHealthService";
