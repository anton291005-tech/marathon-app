import {
  getHealthConsentState,
  isHealthDataProcessingAllowed,
  requestHealthConsentDecision,
  resetHealthConsentStoreForTests,
  setHealthConsentStatus,
  settleHealthConsentDecision,
} from "../healthConsentStore";

beforeEach(() => resetHealthConsentStoreForTests());

describe("healthConsentStore", () => {
  it("ohne Flag immer erlaubt (Production unverändert), mit Flag nur bei Zustimmung", () => {
    expect(isHealthDataProcessingAllowed(false)).toBe(true);
    for (const status of ["loading", "declined", "undecided", "unavailable"] as const) {
      setHealthConsentStatus("u1", status);
      expect(isHealthDataProcessingAllowed(true)).toBe(false);
    }
    setHealthConsentStatus("u1", "granted");
    expect(isHealthDataProcessingAllowed(true)).toBe(true);
  });

  it("Abfrage öffnet das Sheet und liefert die Entscheidung", async () => {
    setHealthConsentStatus("u1", "undecided");
    const decision = requestHealthConsentDecision();
    expect(getHealthConsentState().sheetOpen).toBe(true);
    settleHealthConsentDecision(true);
    await expect(decision).resolves.toBe(true);
    expect(getHealthConsentState().sheetOpen).toBe(false);
  });

  it("abgelehnt oder nicht ladbar: keine Abfrage, sofort false; zugestimmt: sofort true", async () => {
    setHealthConsentStatus("u1", "declined");
    await expect(requestHealthConsentDecision()).resolves.toBe(false);
    setHealthConsentStatus("u1", "unavailable");
    await expect(requestHealthConsentDecision()).resolves.toBe(false);
    expect(getHealthConsentState().sheetOpen).toBe(false);
    setHealthConsentStatus("u1", "granted");
    await expect(requestHealthConsentDecision()).resolves.toBe(true);
  });

  it("zwei gleichzeitige Abfragen bekommen dieselbe Entscheidung", async () => {
    setHealthConsentStatus("u1", "undecided");
    const a = requestHealthConsentDecision();
    const b = requestHealthConsentDecision();
    settleHealthConsentDecision(false);
    await expect(Promise.all([a, b])).resolves.toEqual([false, false]);
  });
});
