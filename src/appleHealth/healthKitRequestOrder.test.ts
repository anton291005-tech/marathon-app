// Gerätebefund Runde 1: Beim Kaltstart kam weder das Zustimmungs-Sheet noch der Apple-Dialog.
// Mit Flag (Jest: localhost) wartet die HealthKit-Anfrage auf die geladene Zustimmung, fragt zuerst in der App und
// ruft das bestehende Plugin danach mit dem passenden Umfang – nur gültige Plugin-Typen.
import { APPLE_HEALTH_CONSENT_TYPES, healthKitRequestReadAuthorization } from "./appleHealthService";
import {
  getHealthConsentState,
  resetHealthConsentStoreForTests,
  setHealthConsentStatus,
  settleHealthConsentDecision,
  waitForHealthConsentResolved,
} from "../health/healthConsentStore";

const mockCalls: Array<{ what: string; read?: string[] }> = [];
jest.mock("@capgo/capacitor-health", () => ({
  Health: {
    requestAuthorization: async (opts: { read: string[] }) => {
      mockCalls.push({ what: "capgo.requestAuthorization", read: opts.read });
      return {};
    },
    checkAuthorization: async () => ({ readAuthorized: [], readDenied: [] }),
  },
}));
jest.mock("./healthSignalsPlugin", () => ({
  MyRaceHealthSignals: {
    requestAuthorization: async () => {
      mockCalls.push({ what: "native.requestAuthorization" });
      return { granted: true, requested: [] };
    },
  },
}));

beforeEach(() => {
  mockCalls.length = 0;
  resetHealthConsentStoreForTests();
});

it("waitForHealthConsentResolved: sofort, wenn geladen; sonst bis zum Laden; spätestens nach dem Timeout", async () => {
  setHealthConsentStatus("u1", "granted");
  await expect(waitForHealthConsentResolved(10)).resolves.toBeUndefined();
  resetHealthConsentStoreForTests();
  const waiting = waitForHealthConsentResolved(10000);
  setHealthConsentStatus("u1", "undecided");
  await expect(waiting).resolves.toBeUndefined();
  resetHealthConsentStoreForTests();
  await expect(waitForHealthConsentResolved(5)).resolves.toBeUndefined();
});

it("Kaltstart: Zustimmung lädt → Sheet → nach „Zustimmen“ erst dann der Apple-Dialog mit allen Erholungs-Typen", async () => {
  const run = healthKitRequestReadAuthorization();
  await Promise.resolve();
  expect(mockCalls).toEqual([]);
  setHealthConsentStatus("u1", "undecided");
  await new Promise((r) => setTimeout(r, 0));
  expect(getHealthConsentState().sheetOpen).toBe(true);
  expect(mockCalls).toEqual([]);
  setHealthConsentStatus("u1", "granted");
  settleHealthConsentDecision(true);
  await run;
  expect(mockCalls[0].what).toBe("capgo.requestAuthorization");
  for (const t of APPLE_HEALTH_CONSENT_TYPES) expect(mockCalls[0].read).toContain(t);
  expect(mockCalls[0].read).toContain("heartRateVariability");
  expect(mockCalls[0].read).toContain("oxygenSaturation");
  expect(mockCalls[0].read).not.toContain("activeEnergyBurned");
  expect(mockCalls.map((c) => c.what)).toEqual(["capgo.requestAuthorization", "native.requestAuthorization"]);
});

it("„Nicht jetzt“: Apple-Dialog nur mit Trainings-Typen, kein nativer Dialog", async () => {
  setHealthConsentStatus("u1", "undecided");
  const run = healthKitRequestReadAuthorization();
  await new Promise((r) => setTimeout(r, 0));
  setHealthConsentStatus("u1", "declined");
  settleHealthConsentDecision(false);
  await run;
  expect(mockCalls.map((c) => c.what)).toEqual(["capgo.requestAuthorization"]);
  for (const t of APPLE_HEALTH_CONSENT_TYPES) expect(mockCalls[0].read).not.toContain(t);
  expect(mockCalls[0].read).toEqual(expect.arrayContaining(["workouts", "heartRate", "calories"]));
});
