// Production darf keinen neuen HealthKit-Dialog für das versteckte Uhr-Signale-Feature anfragen.
import {
  APPLE_HEALTH_CONSENT_TYPES,
  APPLE_HEALTH_READ_TYPES,
  appleHealthReadTypesInScope,
  healthKitFetchRecoveryDailyLast120Days,
  healthSignalsRequestReadAuthorization,
} from "./appleHealthService";
import { resetHealthConsentStoreForTests, setHealthConsentStatus } from "../health/healthConsentStore";

const mockEnabled = { value: false };
const mockRequest = { calls: 0 };

jest.mock("../features/settings/settingsFlags", () => ({
  isWatchSignalsEnabled: () => mockEnabled.value,
}));
jest.mock("./healthSignalsPlugin", () => ({
  MyRaceHealthSignals: {
    requestAuthorization: async () => {
      mockRequest.calls += 1;
      return { granted: true, requested: [] };
    },
  },
}));

beforeEach(() => {
  mockRequest.calls = 0;
  resetHealthConsentStoreForTests();
  setHealthConsentStatus("u1", "granted");
});

describe("Uhr-Signale hinter dem Flag", () => {
  it("ohne Flag: kein nativer Dialog-Aufruf", async () => {
    mockEnabled.value = false;
    await healthSignalsRequestReadAuthorization();
    expect(mockRequest.calls).toBe(0);
  });

  it("mit Flag: nativer Dialog wird angefragt", async () => {
    mockEnabled.value = true;
    await healthSignalsRequestReadAuthorization();
    expect(mockRequest.calls).toBe(1);
  });

  it("ohne Flag fehlt oxygenSaturation im angefragten Umfang, alles andere bleibt", () => {
    mockEnabled.value = false;
    const scope = appleHealthReadTypesInScope();
    expect(scope).not.toContain("oxygenSaturation");
    expect(scope).toHaveLength(APPLE_HEALTH_READ_TYPES.length - 1);
    expect(scope).toContain("heartRateVariability");
  });

  it("mit Flag ist oxygenSaturation dabei", () => {
    mockEnabled.value = true;
    expect(appleHealthReadTypesInScope()).toContain("oxygenSaturation");
  });

  describe("mit Flag, ohne Gesundheits-Zustimmung v2", () => {
    beforeEach(() => {
      mockEnabled.value = true;
    });

    it.each(["loading", "undecided", "declined", "unavailable"] as const)("%s: kein nativer Dialog", async (status) => {
      setHealthConsentStatus("u1", status);
      await healthSignalsRequestReadAuthorization();
      expect(mockRequest.calls).toBe(0);
    });

    it("Anfrage-Umfang ohne Erholungs-Typen, Trainings-Typen bleiben", () => {
      setHealthConsentStatus("u1", "undecided");
      const scope = appleHealthReadTypesInScope();
      for (const t of APPLE_HEALTH_CONSENT_TYPES) expect(scope).not.toContain(t);
      expect(scope).toEqual(expect.arrayContaining(["workouts", "distance", "heartRate", "calories"]));
    });

    it("Erholungswerte werden nicht gelesen", async () => {
      setHealthConsentStatus("u1", "declined");
      await expect(healthKitFetchRecoveryDailyLast120Days()).resolves.toEqual([]);
    });

    it("nach Zustimmung wieder voller Umfang", () => {
      setHealthConsentStatus("u1", "granted");
      expect(appleHealthReadTypesInScope()).toEqual([...APPLE_HEALTH_READ_TYPES]);
    });
  });

  it("ohne Flag ist die Zustimmung egal (Production unverändert)", () => {
    mockEnabled.value = false;
    setHealthConsentStatus("u1", "undecided");
    expect(appleHealthReadTypesInScope()).toEqual(APPLE_HEALTH_READ_TYPES.filter((t) => t !== "oxygenSaturation"));
  });
});
