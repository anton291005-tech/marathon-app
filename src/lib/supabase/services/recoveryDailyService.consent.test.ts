// Erholungs-Tageswerte gehen mit Uhr-Signale-Flag (in Jest an) nur mit Gesundheits-Zustimmung v2 ins Konto.
import { resetHealthConsentStoreForTests, setHealthConsentStatus } from "../../../health/healthConsentStore";
import { saveRecoveryDay } from "./recoveryDailyService";

// Plain-Zähler statt jest.fn: CRA setzt `resetMocks`.
const mockUpserts = { calls: 0 };
jest.mock("../client", () => ({
  supabase: {
    from: () => ({
      upsert: async () => {
        mockUpserts.calls += 1;
        return { error: null };
      },
    }),
  },
}));

beforeEach(() => {
  mockUpserts.calls = 0;
  resetHealthConsentStoreForTests();
});

it("ohne Zustimmung: kein Schreiben", async () => {
  setHealthConsentStatus("u", "declined");
  await saveRecoveryDay("u", { date: "2026-11-12", sleepHours: 7.2 });
  expect(mockUpserts.calls).toBe(0);
});

it("mit Zustimmung: Schreiben wie bisher", async () => {
  setHealthConsentStatus("u", "granted");
  await saveRecoveryDay("u", { date: "2026-11-12", sleepHours: 7.2 });
  expect(mockUpserts.calls).toBe(1);
});
