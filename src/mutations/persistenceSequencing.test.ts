import { APP_CORE_LOCALSTORAGE_EFFECT_ORDER } from "./persistenceSequencing";
import {
  HEALTH_RUNS_STORAGE_KEY,
} from "../healthRuns";
import {
  MARATHON_AI_PLAN_PATCHES_KEY,
  MARATHON_LOGS_KEY,
  MARATHON_PREFERENCES_KEY,
  TRAINING_PLAN_V2_STORAGE_KEY,
} from "../persistence/marathonLocalStorageKeys";
import { RECOVERY_DAILY_STORAGE_KEY } from "../recovery/recoveryStorage";

describe("APP_CORE_LOCALSTORAGE_EFFECT_ORDER", () => {
  it("matches App.tsx core marathon slice persistence registration order", () => {
    expect(APP_CORE_LOCALSTORAGE_EFFECT_ORDER).toEqual([
      MARATHON_LOGS_KEY,
      MARATHON_PREFERENCES_KEY,
      MARATHON_AI_PLAN_PATCHES_KEY,
      TRAINING_PLAN_V2_STORAGE_KEY,
      HEALTH_RUNS_STORAGE_KEY,
      RECOVERY_DAILY_STORAGE_KEY,
    ]);
  });
});
