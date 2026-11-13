// Production darf keinen neuen HealthKit-Dialog für das versteckte Uhr-Signale-Feature anfragen.
import {
  APPLE_HEALTH_READ_TYPES,
  appleHealthReadTypesInScope,
  healthSignalsRequestReadAuthorization,
} from "./appleHealthService";

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
});
