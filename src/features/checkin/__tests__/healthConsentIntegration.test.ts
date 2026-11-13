// Ende-zu-Ende über die echten Module (Store, Zustimmung, HealthKit-Service, Plugin-Fassade); nur das native
// Plugin und Supabase sind ersetzt. Jest läuft unter localhost → Uhr-Signale-Flag an.
import { healthSignalsRequestReadAuthorization } from "../../../appleHealth/appleHealthService";
import { MyRaceHealthSignals } from "../../../appleHealth/healthSignalsPlugin";
import { requestHealthConsentDecision, resetHealthConsentStoreForTests, setHealthConsentStatus } from "../../../health/healthConsentStore";
import { connectAppleHealthWithConsent } from "../healthConsentFlow";
import { grantHealthConsent, revokeHealthConsentAndData } from "../healthConsent";

const mockNative = { calls: [] as string[] };
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
  registerPlugin: () => ({
    requestAuthorization: async () => {
      mockNative.calls.push("requestAuthorization");
      return { granted: true, requested: [] };
    },
    readWorkoutEffort: async () => {
      mockNative.calls.push("readWorkoutEffort");
      return { userScore: 7 };
    },
    readQuantitySamples: async () => ({ samples: [] }),
    availability: async () => ({ healthDataAvailable: true, systemVersion: "27.0", types: {} }),
  }),
}));
const mockDb = { upserts: 0, rpcs: 0 };
jest.mock("../../../lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: async () => {
        mockDb.upserts += 1;
        return { error: null };
      },
    }),
    rpc: async () => {
      mockDb.rpcs += 1;
      return { data: { daily_checkins: 0, recovery_daily: 0, session_logs_rpe: 0 }, error: null };
    },
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  resetHealthConsentStoreForTests();
  mockNative.calls = [];
  mockDb.upserts = 0;
  mockDb.rpcs = 0;
});

it("kein nativer Dialog und kein Lesen vor der Zustimmung; danach genau ein Dialog", async () => {
  setHealthConsentStatus("u1", "undecided");
  await healthSignalsRequestReadAuthorization();
  await MyRaceHealthSignals.readWorkoutEffort({ workoutStart: "2026-11-12T06:00:00Z", workoutEnd: "2026-11-12T07:00:00Z" });
  expect(mockNative.calls).toEqual([]);

  const flow = connectAppleHealthWithConsent({
    watchSignals: true,
    askConsent: requestHealthConsentDecision,
    requestHealthKit: healthSignalsRequestReadAuthorization,
  });
  await Promise.resolve();
  expect(mockNative.calls).toEqual([]);
  await expect(grantHealthConsent("u1")).resolves.toBe(true);
  await flow;
  expect(mockDb.upserts).toBe(1);
  expect(mockNative.calls).toEqual(["requestAuthorization"]);
});

it("nach dem Widerruf liest die App wieder nichts", async () => {
  setHealthConsentStatus("u1", "granted");
  await MyRaceHealthSignals.readWorkoutEffort({ workoutStart: "2026-11-12T06:00:00Z", workoutEnd: "2026-11-12T07:00:00Z" });
  expect(mockNative.calls).toEqual(["readWorkoutEffort"]);
  await expect(revokeHealthConsentAndData("u1")).resolves.toMatchObject({ ok: true });
  expect(mockDb.rpcs).toBe(1);
  await expect(
    MyRaceHealthSignals.readWorkoutEffort({ workoutStart: "2026-11-12T06:00:00Z", workoutEnd: "2026-11-12T07:00:00Z" }),
  ).resolves.toEqual({});
  await healthSignalsRequestReadAuthorization();
  expect(mockNative.calls).toEqual(["readWorkoutEffort"]);
});
