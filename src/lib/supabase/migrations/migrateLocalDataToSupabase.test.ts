import {
  MIGRATION_TO_SUPABASE_DONE_KEY,
  SESSION_LOGS_MIGRATION_DONE_KEY,
  migrateLocalDataToSupabase,
} from "./migrateLocalDataToSupabase";
import { loadProfile } from "../services/profilesService";
import { loadSessionLogs, upsertSessionLogWithResult } from "../services/sessionLogsService";
import { loadTrainingPlan } from "../services/trainingPlanService";
import { loadPlanPatches } from "../services/planPatchesService";
import { loadHealthWorkouts } from "../services/healthWorkoutsService";
import { loadRecoveryDaily } from "../services/recoveryDailyService";
import { loadCoachMemory } from "../services/coachMemoryService";
import { MARATHON_LOGS_KEY } from "../../../persistence/marathonLocalStorageKeys";

jest.mock("../services/profilesService", () => ({
  loadProfile: jest.fn(async () => null),
  saveProfile: jest.fn(async () => undefined),
}));
jest.mock("../services/sessionLogsService", () => ({
  loadSessionLogs: jest.fn(async () => ({})),
  upsertSessionLogWithResult: jest.fn(async () => ({ data: {}, error: null, row: {} })),
}));
jest.mock("../services/trainingPlanService", () => ({
  loadTrainingPlan: jest.fn(async () => null),
  saveTrainingPlan: jest.fn(async () => undefined),
}));
jest.mock("../services/planPatchesService", () => ({
  loadPlanPatches: jest.fn(async () => []),
  savePlanPatch: jest.fn(async () => undefined),
}));
jest.mock("../services/healthWorkoutsService", () => ({
  loadHealthWorkouts: jest.fn(async () => []),
  saveHealthWorkout: jest.fn(async () => undefined),
}));
jest.mock("../services/recoveryDailyService", () => ({
  loadRecoveryDaily: jest.fn(async () => []),
  saveRecoveryDay: jest.fn(async () => undefined),
}));
jest.mock("../services/coachMemoryService", () => ({
  loadCoachMemory: jest.fn(async () => null),
  saveCoachMemory: jest.fn(async () => undefined),
}));
jest.mock("../client", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
  },
}));
import { supabase } from "../client";

const USER_ID = "user-1";

describe("migrateLocalDataToSupabase — done-flag dispatch", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
    });
  });

  test("frischer Account ohne lokale Daten: voller Durchlauf, danach beide Flags gesetzt", async () => {
    const result = await migrateLocalDataToSupabase(USER_ID);

    expect(loadProfile).toHaveBeenCalledTimes(1);
    expect(loadSessionLogs).toHaveBeenCalledTimes(1);
    expect(loadTrainingPlan).toHaveBeenCalledTimes(1);
    expect(loadPlanPatches).toHaveBeenCalledTimes(1);
    expect(loadHealthWorkouts).toHaveBeenCalledTimes(1);
    expect(loadRecoveryDaily).toHaveBeenCalledTimes(1);
    expect(loadCoachMemory).toHaveBeenCalledTimes(1);

    expect(result).toBe(false); // nichts hochgeladen
    expect(localStorage.getItem(MIGRATION_TO_SUPABASE_DONE_KEY)).toBe("1");
    expect(localStorage.getItem(SESSION_LOGS_MIGRATION_DONE_KEY)).toBe("1");
  });

  test("bereits vollständig migrierter Account: kein einziger Read, auch kein recovery_daily", async () => {
    localStorage.setItem(MIGRATION_TO_SUPABASE_DONE_KEY, "1");
    localStorage.setItem(SESSION_LOGS_MIGRATION_DONE_KEY, "1");

    const result = await migrateLocalDataToSupabase(USER_ID);

    expect(loadRecoveryDaily).not.toHaveBeenCalled();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(loadSessionLogs).not.toHaveBeenCalled();
    expect(loadTrainingPlan).not.toHaveBeenCalled();
    expect(loadPlanPatches).not.toHaveBeenCalled();
    expect(loadHealthWorkouts).not.toHaveBeenCalled();
    expect(loadCoachMemory).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test("Core migriert, Session-Logs noch offen: nur loadSessionLogs, kein zweiter recovery_daily-Read", async () => {
    localStorage.setItem(MIGRATION_TO_SUPABASE_DONE_KEY, "1");
    // SESSION_LOGS_MIGRATION_DONE_KEY absichtlich nicht gesetzt

    const result = await migrateLocalDataToSupabase(USER_ID);

    expect(loadSessionLogs).toHaveBeenCalledTimes(1);
    expect(loadRecoveryDaily).not.toHaveBeenCalled();
    expect(loadProfile).not.toHaveBeenCalled();
    expect(loadTrainingPlan).not.toHaveBeenCalled();
    expect(loadPlanPatches).not.toHaveBeenCalled();
    expect(loadHealthWorkouts).not.toHaveBeenCalled();
    expect(loadCoachMemory).not.toHaveBeenCalled();

    expect(result).toBe(false); // nichts pending -> nichts hochgeladen
    expect(localStorage.getItem(SESSION_LOGS_MIGRATION_DONE_KEY)).toBe("1");
  });

  test("Core migriert, Session-Logs scheitern weiterhin: Session-Logs-Flag bleibt aus, Core-Flag bleibt gesetzt", async () => {
    localStorage.setItem(MIGRATION_TO_SUPABASE_DONE_KEY, "1");
    localStorage.setItem(MARATHON_LOGS_KEY, JSON.stringify({ "session-1": { done: true } }));
    (loadSessionLogs as jest.Mock).mockResolvedValue({}); // "session-1" nicht remote vorhanden
    (upsertSessionLogWithResult as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "boom", code: "23505" },
      row: {},
    });

    const result = await migrateLocalDataToSupabase(USER_ID);

    expect(loadSessionLogs).toHaveBeenCalledTimes(1);
    expect(loadRecoveryDaily).not.toHaveBeenCalled();
    expect(result).toBe(false);
    expect(localStorage.getItem(SESSION_LOGS_MIGRATION_DONE_KEY)).toBeNull();
    expect(localStorage.getItem(MIGRATION_TO_SUPABASE_DONE_KEY)).toBe("1");
  });

  test("Regression: frischer Account mit fehlschlagenden Session-Logs setzt Core-Flag trotzdem (verhindert künftige Doppel-Reads der anderen Domänen)", async () => {
    localStorage.setItem(MARATHON_LOGS_KEY, JSON.stringify({ "session-1": { done: true } }));
    (loadSessionLogs as jest.Mock).mockResolvedValue({});
    (upsertSessionLogWithResult as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "boom", code: "23505" },
      row: {},
    });

    const result = await migrateLocalDataToSupabase(USER_ID);

    expect(loadRecoveryDaily).toHaveBeenCalledTimes(1); // erster (einziger nötiger) voller Durchlauf
    expect(result).toBe(false);
    expect(localStorage.getItem(MIGRATION_TO_SUPABASE_DONE_KEY)).toBe("1");
    expect(localStorage.getItem(SESSION_LOGS_MIGRATION_DONE_KEY)).toBeNull();

    // Nächster Aufruf (z. B. nächster Page-Load): nur noch Session-Logs-Retry, kein recovery_daily mehr.
    (loadRecoveryDaily as jest.Mock).mockClear();
    await migrateLocalDataToSupabase(USER_ID);
    expect(loadRecoveryDaily).not.toHaveBeenCalled();
  });
});
