import { safeReadLocalStorageJson, safeRemoveLocalStorageItem, safeWriteLocalStorageJson } from "../../persistence/safeLocalStorage";
import { readMigrationFlags, writeMigrationFlags } from "../../migrationFlags";

const LS_POST_WORKOUT_STATE = "postWorkoutSummary_state_v2";

type PostWorkoutPersistedState = {
  lastShownWorkoutId: string | null;
  lastEvaluatedWorkoutId: string | null;
};

function normalizeWorkoutId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function repairPostWorkoutSummaryState(): void {
  const raw = safeReadLocalStorageJson<unknown>(LS_POST_WORKOUT_STATE, null);
  if (raw == null) return;

  if (typeof raw !== "object" || Array.isArray(raw)) {
    safeRemoveLocalStorageItem(LS_POST_WORKOUT_STATE);
    return;
  }

  const row = raw as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(row, "lastShownWorkoutId")) {
    safeRemoveLocalStorageItem(LS_POST_WORKOUT_STATE);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(row, "lastEvaluatedWorkoutId")) {
    safeRemoveLocalStorageItem(LS_POST_WORKOUT_STATE);
    return;
  }

  const normalized: PostWorkoutPersistedState = {
    lastShownWorkoutId: normalizeWorkoutId(row.lastShownWorkoutId),
    lastEvaluatedWorkoutId: normalizeWorkoutId(row.lastEvaluatedWorkoutId),
  };

  safeWriteLocalStorageJson(LS_POST_WORKOUT_STATE, normalized);
}

function repairMigrationFlags(): void {
  const flags = readMigrationFlags();
  const forceId = flags.forcePostWorkoutCardForWorkoutId;
  if (forceId != null && typeof forceId !== "string") {
    writeMigrationFlags({ ...flags, forcePostWorkoutCardForWorkoutId: null });
  }
}

/**
 * Runs once during JS boot — resets inconsistent persisted session/summary state
 * so a stale workout completion cannot crash the next cold start.
 */
export function repairPersistedStateOnBoot(): void {
  repairPostWorkoutSummaryState();
  repairMigrationFlags();
}
