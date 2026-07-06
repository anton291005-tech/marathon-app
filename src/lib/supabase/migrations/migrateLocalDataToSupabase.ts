import { validateTrainingPlanV2Integrity } from "../../../ai/validation/validateTrainingPlanV2Integrity";
import { normalizeTrainingPlan } from "../../../planV2/normalizeTrainingPlan";
import type { PersistedMarathonPreferences } from "../../../app/runtime/runtimePersistenceTypes";
import { HEALTH_RUNS_STORAGE_KEY, loadHealthRunsFromStorage } from "../../../healthRuns";
import { getCoachMemory } from "../../../lib/ai/memory/coachMemory";
import type { PlanPatch } from "../../../lib/ai/types";
import type { SessionLog } from "../../../marathonPrediction";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "../../../persistence/marathonLocalStorageKeys";
import type { TrainingPlanV2 } from "../../../planV2/types";
import { isUserTrainingPlan } from "../../../planV2/isUserTrainingPlan";
import {
  RECOVERY_DAILY_STORAGE_KEY,
  loadRecoveryDailyFromStorage,
} from "../../../recovery/recoveryStorage";
import type { RecoveryDailyRow } from "../../../recovery/recoveryTypes";
import { safeParseJSON } from "../../../safeParseJSON";
import { hydrateMarathonLogsFromStorage } from "../../../sessionLogs/hydrateMarathonLogs";
import { loadCoachMemory, saveCoachMemory } from "../services/coachMemoryService";
import { loadHealthWorkouts, saveHealthWorkout } from "../services/healthWorkoutsService";
import { loadPlanPatches, savePlanPatch } from "../services/planPatchesService";
import { loadProfile, saveProfile } from "../services/profilesService";
import { loadRecoveryDaily, saveRecoveryDay } from "../services/recoveryDailyService";
import { supabase } from "../client";
import { loadSessionLogs, upsertSessionLogWithResult } from "../services/sessionLogsService";
import { loadTrainingPlan, saveTrainingPlan } from "../services/trainingPlanService";

export const MIGRATION_TO_SUPABASE_DONE_KEY = "migration_to_supabase_done_v1";
/** First Supabase row revision for a user — not `TrainingPlanV2.version` (schema version 2). */
export const INITIAL_TRAINING_PLAN_REVISION = 1;
const COACH_MEMORY_STORAGE_KEY = "marathon.coachMemory.v1";

/**
 * localStorage keys read by this migration (must match App / persistence SSOT):
 * - marathonLogs → session_logs (Supabase)
 * - marathonPreferences → profiles
 * - training_plan_v2 → training_plans
 * - marathonAiPlanPatches → plan_patches
 * - healthRuns → health_workouts
 * - recoveryHealthDaily → recovery_daily
 * Not migrated here: appleHealthAnchors, marathonRecoveryHomeScoreByDay,
 * marathonRecoveryBootPhaseComplete, marathonPredictiveAiDecisionV1 (device/UI only).
 */
function readLocalStorageRaw(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (raw == null || raw.trim() === "") return null;
  return raw;
}

function isRemoteProfileEmpty(remote: PersistedMarathonPreferences | null): boolean {
  if (remote == null) return true;
  const hasTarget = remote.targetTime != null && String(remote.targetTime).trim() !== "";
  const hasMhr = remote.maxHeartRateBpm != null && Number.isFinite(remote.maxHeartRateBpm);
  return !hasTarget && !hasMhr;
}

function readLocalPreferences(): PersistedMarathonPreferences | null {
  const raw = readLocalStorageRaw(MARATHON_PREFERENCES_KEY);
  if (!raw) return null;
  const prefs = safeParseJSON<unknown>(raw, null);
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return null;
  const p = prefs as PersistedMarathonPreferences;
  const hasTarget = p.targetTime != null && String(p.targetTime).trim() !== "";
  const hasMhr = p.maxHeartRateBpm != null && Number.isFinite(p.maxHeartRateBpm);
  return hasTarget || hasMhr ? p : null;
}

function readLocalTrainingPlan(): TrainingPlanV2 | null {
  const raw = readLocalStorageRaw(TRAINING_PLAN_V2_STORAGE_KEY);
  if (!raw) return null;
  const plan = safeParseJSON<unknown>(raw, null);
  const normalized = normalizeTrainingPlan(plan);
  if (!validateTrainingPlanV2Integrity(normalized)) return null;
  if (normalized.workouts.length === 0) return null;
  return normalized;
}

function readLocalSessionLogs(): Record<string, SessionLog> {
  const raw = readLocalStorageRaw(MARATHON_LOGS_KEY);
  if (!raw) return {};
  return hydrateMarathonLogsFromStorage(safeParseJSON(raw, {})) as Record<string, SessionLog>;
}

function readLocalPlanPatches(): PlanPatch[] {
  const raw = readLocalStorageRaw(MARATHON_AI_PLAN_PATCHES_KEY);
  if (!raw) return [];
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  const out: PlanPatch[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const patch = item as PlanPatch;
    if (typeof patch.sessionId !== "string" || !patch.sessionId.trim()) continue;
    out.push({
      sessionId: patch.sessionId.trim(),
      changes: patch.changes ?? {},
      reason: patch.reason,
    });
  }
  return out;
}

function readLocalHealthRuns() {
  return loadHealthRunsFromStorage(
    (key) => (key === HEALTH_RUNS_STORAGE_KEY ? readLocalStorageRaw(key) : null),
    safeParseJSON,
  );
}

function readLocalRecoveryDaily(): RecoveryDailyRow[] {
  return loadRecoveryDailyFromStorage(
    (key) => (key === RECOVERY_DAILY_STORAGE_KEY ? readLocalStorageRaw(key) : null),
    safeParseJSON,
  );
}

function hasLocalCoachMemory(): boolean {
  return readLocalStorageRaw(COACH_MEMORY_STORAGE_KEY) != null;
}

type SessionLogsMigrationSummary = {
  uploadedAny: boolean;
  sessionLogsOk: boolean;
};

/**
 * Upload local marathonLogs rows missing from remote. Logs every step for device console debugging.
 * `sessionLogsOk` is false when any required upsert returned a Supabase error.
 */
async function migrateSessionLogsToSupabase(
  userId: string,
  localLogs: Record<string, SessionLog>,
  remoteLogs: Record<string, SessionLog> | null,
): Promise<SessionLogsMigrationSummary> {
  const remoteLogMap = remoteLogs ?? {};
  const remoteLoadFailed = remoteLogs === null;

  const logsToUpload: { sessionId: string; log: SessionLog }[] = [];
  const skippedAlreadyRemote: string[] = [];

  for (const [sessionId, log] of Object.entries(localLogs)) {
    if (sessionId in remoteLogMap) {
      skippedAlreadyRemote.push(sessionId);
      continue;
    }
    logsToUpload.push({ sessionId, log });
  }

  // eslint-disable-next-line no-console
  console.log("[migration] session_logs — local keys:", Object.keys(localLogs).length, {
    remoteLoadFailed,
    remoteKeyCount: remoteLogs ? Object.keys(remoteLogs).length : 0,
    skippedAlreadyRemote: skippedAlreadyRemote.length,
    logsToUpload: logsToUpload.length,
    sampleSessionIds: logsToUpload.slice(0, 5).map((x) => x.sessionId),
  });

  if (logsToUpload.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[migration] session_logs insert loop skipped (nothing to upload)", {
      reason:
        Object.keys(localLogs).length === 0
          ? "empty_local_marathonLogs"
          : remoteLoadFailed
            ? "remote_load_failed_treated_as_empty"
            : "all_session_ids_already_in_remote",
    });
    return { uploadedAny: false, sessionLogsOk: true };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const authUid = session?.user?.id ?? null;
  // eslint-disable-next-line no-console
  console.log("[migration] session_logs auth check", {
    paramUserId: userId,
    authUid,
    userIdMatchesAuth: authUid === userId,
    rlsNote: "session_logs policy requires user_id = auth.uid() on INSERT",
  });

  // eslint-disable-next-line no-console
  console.log("[migration] logs to upload:", logsToUpload.length);

  let uploadedAny = false;
  let failureCount = 0;

  for (const { sessionId, log } of logsToUpload) {
    // eslint-disable-next-line no-console
    console.log("[migration] calling session_logs upsert", { sessionId, userId });

    const { data, error, row } = await upsertSessionLogWithResult(userId, sessionId, log);

    // eslint-disable-next-line no-console
    console.log("[migration] insert result:", JSON.stringify(error ?? { ok: true, sessionId }));
    if (data != null) {
      // eslint-disable-next-line no-console
      console.log("[migration] insert data:", JSON.stringify(data));
    }
    // eslint-disable-next-line no-console
    console.log("[migration] upsert row payload", {
      session_id: row.session_id,
      user_id: row.user_id,
      session_idIsNonEmpty: typeof row.session_id === "string" && row.session_id.length > 0,
    });

    if (error) {
      failureCount += 1;
      // eslint-disable-next-line no-console
      console.error("[migration] session_logs upsert failed", {
        sessionId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      continue;
    }

    uploadedAny = true;
  }

  const sessionLogsOk = failureCount === 0;
  // eslint-disable-next-line no-console
  console.log("[migration] session_logs finished", {
    attempted: logsToUpload.length,
    failures: failureCount,
    sessionLogsOk,
  });

  return { uploadedAny, sessionLogsOk };
}

/**
 * One-time upload of pre-auth localStorage data into Supabase for a signed-in user.
 * Session logs: merge — upload local rows whose sessionId is not yet in remote.
 * Sets `MIGRATION_TO_SUPABASE_DONE_KEY` only when uploads succeeded without session_logs errors.
 */
export async function migrateLocalDataToSupabase(userId: string): Promise<boolean> {
  if (!userId || typeof localStorage === "undefined") {
    // eslint-disable-next-line no-console
    console.log("[migration] abort early: missing userId or localStorage");
    return false;
  }
  if (localStorage.getItem(MIGRATION_TO_SUPABASE_DONE_KEY) === "1") {
    // eslint-disable-next-line no-console
    console.log("[migration] abort early: migration_to_supabase_done_v1 already set");
    return false;
  }

  // eslint-disable-next-line no-console
  console.log("[migration] migrateLocalDataToSupabase start", { userId });

  let uploadedAny = false;
  let sessionLogsOk = true;

  try {
    const [
      remoteProfile,
      remoteLogs,
      remotePlan,
      remotePatches,
      remoteHealthRuns,
      remoteRecovery,
      remoteCoachMemory,
    ] = await Promise.all([
      loadProfile(userId),
      loadSessionLogs(userId),
      loadTrainingPlan(userId),
      loadPlanPatches(userId),
      loadHealthWorkouts(userId),
      loadRecoveryDaily(userId),
      loadCoachMemory(userId),
    ]);

    const localPrefs = readLocalPreferences();
    if (localPrefs && isRemoteProfileEmpty(remoteProfile)) {
      await saveProfile(userId, localPrefs);
      uploadedAny = true;
    }

    const localLogs = readLocalSessionLogs();
    const sessionLogsMigration = await migrateSessionLogsToSupabase(userId, localLogs, remoteLogs);
    if (sessionLogsMigration.uploadedAny) uploadedAny = true;
    sessionLogsOk = sessionLogsMigration.sessionLogsOk;

    const localPlan = readLocalTrainingPlan();
    if (localPlan && remotePlan == null) {
      const localPrefsForPlan = readLocalPreferences();
      if (!isUserTrainingPlan(localPlan, localPrefsForPlan)) {
        // eslint-disable-next-line no-console
        console.log("[Migration] Skipping BASE_PLAN upload – not a real user plan");
      } else {
        try {
          const prefs = localPrefsForPlan ?? {};
          const planName = [
            prefs.raceDistanceLabel ?? "Marathon",
            prefs.raceName,
            prefs.raceDate,
          ]
            .filter(Boolean)
            .join(" – ");
          await saveTrainingPlan(userId, localPlan, planName || `Trainingsplan ${INITIAL_TRAINING_PLAN_REVISION}`);
          uploadedAny = true;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[migration] training_plans failed:", JSON.stringify(e));
        }
      }
    }

    const localPatches = readLocalPlanPatches();
    const remotePatchesEmpty = remotePatches == null || remotePatches.length === 0;
    if (remotePatchesEmpty && localPatches.length > 0) {
      for (const patch of localPatches) {
        await savePlanPatch(userId, patch);
      }
      uploadedAny = true;
    }

    const localHealthRuns = readLocalHealthRuns();
    const remoteHealthEmpty = remoteHealthRuns == null || remoteHealthRuns.length === 0;
    if (remoteHealthEmpty && localHealthRuns.length > 0) {
      for (const run of localHealthRuns) {
        await saveHealthWorkout(userId, run);
      }
      uploadedAny = true;
    }

    const localRecovery = readLocalRecoveryDaily();
    const remoteRecoveryEmpty = remoteRecovery == null || remoteRecovery.length === 0;
    if (remoteRecoveryEmpty && localRecovery.length > 0) {
      for (const row of localRecovery) {
        await saveRecoveryDay(userId, row);
      }
      uploadedAny = true;
    }

    if (hasLocalCoachMemory() && remoteCoachMemory == null) {
      await saveCoachMemory(userId, getCoachMemory());
      uploadedAny = true;
    }

    const localLogsPending = Object.keys(readLocalSessionLogs()).length;
    const maySetDoneFlag = !uploadedAny || (uploadedAny && sessionLogsOk);

    // eslint-disable-next-line no-console
    console.log("[migration] done-flag decision", {
      uploadedAny,
      sessionLogsOk,
      localLogsPending,
      maySetDoneFlag,
    });

    if (maySetDoneFlag) {
      localStorage.setItem(MIGRATION_TO_SUPABASE_DONE_KEY, "1");
      // eslint-disable-next-line no-console
      console.log("[migration] migration_to_supabase_done_v1 set");
    } else if (uploadedAny && !sessionLogsOk) {
      // eslint-disable-next-line no-console
      console.warn(
        "[migration] migration_to_supabase_done_v1 NOT set — other data uploaded but session_logs had errors",
      );
    }

    return uploadedAny && sessionLogsOk;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[migrateLocalDataToSupabase]", err);
    return false;
  }
}
